import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import {
  applyOrderItemChange,
  releaseOrderStock,
  restoreOrderStock,
  InsufficientStockError,
  type TargetLine,
} from "@/lib/stock";
import { makeOptionKey, normalizeOptionKey } from "@/lib/menu-options";
import { syncPrepaidFromRecords } from "@/lib/payment-records";
import { resolveOrderLines, OptionError } from "@/lib/menu-options-server";
import {
  computeOrderTotals,
  checkStaffChange,
  isOrderEditable,
  recalcOrderTotals,
  countRodsFromItems,
  FISH_INCLUDED_KG_PER_ROD,
  type DiscountTypeValue,
} from "@/lib/orders";

// Neon(us-east-2) ← 泰国：往返延迟较高，放宽函数执行上限
export const maxDuration = 60;

const ORDER_INCLUDE = {
  items: {
    include: {
      menuItem: { select: { name_zh: true, name_en: true, name_th: true, price: true } },
    },
  },
  weighings: { orderBy: { createdAt: "asc" as const } },
  payment: true,
  bookings: { include: { pond: true } },
  table: true,
};

/**
 * GET /api/admin/orders/[id] —— 后台订单详情
 *
 * 返回订单实体：菜品行（含菜名）、称重记录、支付单、餐桌、预订。
 * 字段**平铺在顶层**，与本文件 PATCH 的返回形状保持一致，
 * 便于「改单/折扣/取消」后就地刷新同一份数据。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Admin get order error:", error);
    return NextResponse.json(
      { error: "Failed to load order" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/orders/[id]
 *
 * body.action 取值：
 *  - 省略          → 兼容旧接口，按 body.tableCode 改绑餐桌
 *  - "status"      → { status } 流转后厨状态（PREPARING/READY/SERVED…）
 *  - "items"       → { items: [{menuItemId, quantity}] } 改单（减量会加回库存）
 *  - "discount"    → { discountType, discountValue, note, adminPassword? }
 *  - "cancel"      → 取消订单（释放预占 / 回补已扣库存）
 *  - "restore"     → 误取消后恢复：{ status? } 重建预占、撤回取消时的回补
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // ---------- 1) 兼容旧接口：改绑餐桌 ----------
    if (!action) {
      const tableCode = body?.tableCode ?? undefined;
      const data: { tableId: string | null; orderType?: "DINE_IN" | "TAKEAWAY" } = {
        tableId: null,
      };

      if (tableCode !== null && tableCode !== undefined) {
        const table = await prisma.diningTable.findUnique({
          where: { code: String(tableCode).toUpperCase() },
        });
        if (!table || !table.isActive) {
          return NextResponse.json(
            { error: "Invalid or inactive table code" },
            { status: 400 },
          );
        }
        data.tableId = table.id;
        data.orderType = "DINE_IN";
      } else {
        data.orderType = "TAKEAWAY";
      }

      const updated = await prisma.order.update({
        where: { id },
        data,
        include: ORDER_INCLUDE,
      });
      return NextResponse.json(updated);
    }

    // ---------- 2) 状态流转 ----------
    if (action === "status") {
      const status = String(body.status || "");
      const allowed = ["PREPARING", "READY", "SERVED", "PENDING"];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${allowed.join(", ")}` },
          { status: 400 },
        );
      }
      if (order.status === "CANCELLED" || order.status === "SETTLED") {
        return NextResponse.json(
          { error: "Order is already closed" },
          { status: 400 },
        );
      }
      const updated = await prisma.order.update({
        where: { id },
        data: { status: status as any },
        include: ORDER_INCLUDE,
      });
      return NextResponse.json(updated);
    }

    // ---------- 3) 改单（增减菜品） ----------
    //
    // 行匹配按「菜品 + 选项」的 optionKey，不再按 menuItemId：
    // 「加大蛋面」和「标准米粉」是同菜的两行，只按菜品匹配会互相吃掉。
    //  - 已存在的行：沿用原单价与选项快照，只改数量（历史价不会被今天的价目洗掉）
    //  - 新行：必须带 optionIds，由服务端按选项解析出单价
    //  - quantity ≤ 0：删行（预占释放、已扣减部分回补库存）
    if (action === "items") {
      if (!isOrderEditable(order.status)) {
        return NextResponse.json(
          { error: "Order is already closed; use a discount instead" },
          { status: 400 },
        );
      }
      const raw = Array.isArray(body.items) ? body.items : null;
      if (!raw) {
        return NextResponse.json({ error: "items[] is required" }, { status: 400 });
      }

      let result;
      try {
        result = await runTx(async (tx) => {
          const currentRows = await tx.orderItem.findMany({ where: { orderId: id } });
          const existingByKey = new Map(
            currentRows.map((r) => [normalizeOptionKey(r.optionKey, r.menuItemId), r]),
          );

          const targets: TargetLine[] = [];
          const needResolve: {
            menuItemId: string;
            quantity: number;
            optionIds: string[];
            note: string | null;
          }[] = [];

          for (const l of raw) {
            const menuItemId = String(l?.menuItemId || "");
            if (!menuItemId) continue;
            const quantity = Math.max(0, Math.floor(Number(l?.quantity) || 0));
            const optionIds = Array.isArray(l?.optionIds) ? l.optionIds.map(String) : [];
            const key =
              typeof l?.optionKey === "string" && l.optionKey.length > 0
                ? l.optionKey
                : makeOptionKey(menuItemId, optionIds);

            if (quantity <= 0) {
              // 删行：只需要行键，不必解析价格
              targets.push({ menuItemId, quantity: 0, optionKey: key });
              continue;
            }

            const ex = existingByKey.get(key);
            if (ex) {
              targets.push({
                menuItemId,
                quantity,
                optionKey: key,
                unitPrice: ex.unitPrice,
                options: ex.options ?? null,
                ...(l.note !== undefined ? { note: String(l.note ?? "").slice(0, 200) } : {}),
              });
            } else {
              needResolve.push({
                menuItemId,
                quantity,
                optionIds,
                note: l.note != null ? String(l.note).slice(0, 200) : null,
              });
            }
          }

          if (needResolve.length > 0) {
            const { lines } = await resolveOrderLines(tx, needResolve);
            for (const rl of lines) {
              targets.push({
                menuItemId: rl.menuItemId,
                quantity: rl.quantity,
                optionKey: rl.optionKey,
                unitPrice: rl.unitPrice,
                options: rl.options,
                note: rl.note,
              });
            }
          }

          const change = await applyOrderItemChange(tx, id, targets, {
            adminName: admin.username,
          });

          // 菜品行变了 → 重新计算小计 / 折扣 / 应付净额
          const totals = await recalcOrderTotals(tx, id);

          // 未付款的支付单同步最新金额，避免收错钱
          await tx.payment.updateMany({
            where: { orderId: id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
            data: { amount: totals.totalPrice },
          });

          return { change, totals };
        });
      } catch (e: any) {
        if (e instanceof OptionError) {
          return NextResponse.json(
            { error: e.humanMessage, code: e.code },
            { status: 400 },
          );
        }
        if (e instanceof InsufficientStockError) {
          return NextResponse.json(
            { error: `${e.itemName} 已售罄，无法增加数量` },
            { status: 400 },
          );
        }
        throw e;
      }

      const updated = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      return NextResponse.json({ order: updated, ...result });
    }

    // ---------- 4) 折扣 / 改价 ----------
    if (action === "discount") {
      if (order.status === "CANCELLED") {
        return NextResponse.json({ error: "Order is cancelled" }, { status: 400 });
      }
      const discountType = String(body.discountType || "NONE") as DiscountTypeValue;
      if (!["NONE", "PERCENT", "AMOUNT"].includes(discountType)) {
        return NextResponse.json({ error: "Invalid discountType" }, { status: 400 });
      }
      const discountValue = Math.max(0, Number(body.discountValue) || 0);
      const note = typeof body.note === "string" ? body.note.trim() : "";

      // 先按现状算出「毛额」，用于判断改价幅度（免扣按鱼竿数×1kg）
      const items = await prisma.orderItem.findMany({
        where: { orderId: id },
        select: { quantity: true, totalPrice: true, menuItem: { select: { name_zh: true, name_en: true, name_th: true } } },
      });
      const weighings = await prisma.weighing.findMany({ where: { orderId: id } });
      const rodCount = countRodsFromItems(items);
      const probe = computeOrderTotals({
        subtotal: items.reduce((s, i) => s + i.totalPrice, 0),
        fishWeightKg: weighings.reduce((s, w) => s + w.weightKg, 0),
        discountType,
        discountValue,
        includedKg: rodCount * FISH_INCLUDED_KG_PER_ROD,
      });

      const guard = checkStaffChange(probe.gross, probe.discountAmount);
      if (guard.needsAdmin) {
        const password = typeof body.adminPassword === "string" ? body.adminPassword : "";
        const me = await prisma.adminUser.findUnique({ where: { id: admin.id } });
        const ok = !!me && !!password && (await bcrypt.compare(password, me.password));
        if (!ok) {
          return NextResponse.json(
            {
              error: "Over staff limit — admin password required",
              code: "NEEDS_ADMIN",
              ratio: guard.ratio,
              gross: guard.gross,
              discountAmount: probe.discountAmount,
            },
            { status: 403 },
          );
        }
      }

      if (discountType !== "NONE" && probe.discountAmount > 0 && !note) {
        return NextResponse.json(
          { error: "Discount reason is required" },
          { status: 400 },
        );
      }

      const updated = await runTx(async (tx) => {
        await tx.order.update({
          where: { id },
          data: {
            discountType,
            discountValue,
            discountNote: note || null,
            adjustedBy: admin.username,
            adjustedAt: new Date(),
          },
        });
        const totals = await recalcOrderTotals(tx, id);

        await tx.payment.updateMany({
          where: { orderId: id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
          data: { amount: totals.totalPrice },
        });

        return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      });

      return NextResponse.json(updated);
    }

    // ---------- 5) 取消 ----------
    if (action === "cancel") {
      if (order.status === "SETTLED") {
        return NextResponse.json(
          { error: "Settled order cannot be cancelled" },
          { status: 400 },
        );
      }
      if (order.status === "CANCELLED") {
        const already = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
        return NextResponse.json(already);
      }
      const updated = await runTx(async (tx) => {
        await releaseOrderStock(tx, id, { adminName: admin.username });
        // 取消订单 → 已收的钱一并作废：只标 voidedAt（流水仍只追加不覆盖），
        // 否则这笔钱会继续按 paidAt 落日计入营收报表，账实不符。
        // 真实世界的退钱（现金/扫码原路退回）由店员线下处理。
        const voided = await tx.paymentRecord.updateMany({
          where: { orderId: id, voidedAt: null },
          data: { voidedAt: new Date() },
        });
        await syncPrepaidFromRecords(tx, id);
        const row = await tx.order.update({
          where: { id },
          data: { status: "CANCELLED" },
          include: ORDER_INCLUDE,
        });
        return { order: row, voidedRecords: voided.count };
      });
      return NextResponse.json(updated.order);
    }

    // ---------- 6) 恢复误取消的订单 ----------
    //
    // 只对 CANCELLED 生效。三件事必须一起做，否则账实不符：
    //   1) 状态改回 PENDING/…（默认 PENDING）
    //   2) 重建预占 —— 取消时把它清零了，不重建这桌的菜就不占库存，可能超卖
    //   3) 撤回取消时的回补 —— 若取消真的加回过库存，要再扣回去
    // 库存不足则整单拒绝，不做「部分恢复」。
    if (action === "restore") {
      if (order.status !== "CANCELLED") {
        return NextResponse.json(
          {
            error: "Order is not cancelled",
            code: "NOT_CANCELLED",
            status: order.status,
          },
          { status: 400 },
        );
      }
      const status = String(body.status || "PENDING");
      const allowed = ["PENDING", "PREPARING", "READY", "SERVED"];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${allowed.join(", ")}` },
          { status: 400 },
        );
      }

      let stock: { reserved: number; unRestored: number };
      try {
        stock = await runTx(async (tx) => {
          const res = await restoreOrderStock(tx, id, { adminName: admin.username });
          await tx.order.update({
            where: { id },
            data: {
              status: status as any,
              // 恢复后订单重新变为未结清：清空结清与库存转正时点，留痕在 adjustedBy
              settledAt: null,
              adjustedBy: admin.username,
              adjustedAt: new Date(),
            },
          });
          return res;
        });
      } catch (e: any) {
        if (e instanceof InsufficientStockError) {
          return NextResponse.json(
            {
              error: `${e.itemName} 库存不足，无法恢复该订单`,
              code: "INSUFFICIENT_STOCK",
            },
            { status: 400 },
          );
        }
        throw e;
      }

      const updated = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      return NextResponse.json({ order: updated, stock });
    }

    // ---------- 7) 已结账订单退回未结账 ----------
    //
    // 场景：结账后顾客又继续下单/继续消费，需要把单退回未结账状态继续记。
    // 铁律：
    //   - 已收金额**一律不动**：PaymentRecord 流水原样保留（append-only），
    //     只把 prepaidAmount 重新对齐到流水实收（防止结清时被顶成全额）；
    //   - 库存**不做任何动作**：结算时已正式扣减（stockConsumedAt 幂等守卫），
    //     退回既不回补也不重扣；
    //   - settledAt 清空，订单重新出现在「待收款」，差额在结算页继续收。
    if (action === "reopen") {
      if (order.status !== "SETTLED") {
        return NextResponse.json(
          { error: "Order is not settled", code: "NOT_SETTLED", status: order.status },
          { status: 400 },
        );
      }
      const status = String(body.status || "SERVED");
      const allowed = ["PENDING", "PREPARING", "READY", "SERVED"];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${allowed.join(", ")}` },
          { status: 400 },
        );
      }
      const updated = await runTx(async (tx) => {
        await tx.order.update({
          where: { id },
          data: {
            status: status as any,
            settledAt: null,
            adjustedBy: admin.username,
            adjustedAt: new Date(),
          },
        });
        // 只把 prepaidAmount 对齐回流水实收，不动流水本身
        await syncPrepaidFromRecords(tx, id);
        return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Admin update order error:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 },
    );
  }
}
