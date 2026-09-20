import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import {
  applyOrderItemChange,
  releaseOrderStock,
  InsufficientStockError,
} from "@/lib/stock";
import {
  computeOrderTotals,
  checkStaffChange,
  isOrderEditable,
  recalcOrderTotals,
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
      { error: error.message || "Failed to load order" },
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
    if (action === "items") {
      if (!isOrderEditable(order.status)) {
        return NextResponse.json(
          { error: "Order is already closed; use a discount instead" },
          { status: 400 },
        );
      }
      const lines = Array.isArray(body.items) ? body.items : null;
      if (!lines) {
        return NextResponse.json({ error: "items[] is required" }, { status: 400 });
      }

      let result;
      try {
        result = await runTx(async (tx) => {
          const change = await applyOrderItemChange(
            tx,
            id,
            lines.map((l: any) => ({
              menuItemId: String(l.menuItemId),
              quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)),
            })),
            { adminName: admin.username },
          );

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

      // 先按现状算出「毛额」，用于判断改价幅度
      const items = await prisma.orderItem.findMany({ where: { orderId: id } });
      const weighings = await prisma.weighing.findMany({ where: { orderId: id } });
      const probe = computeOrderTotals({
        subtotal: items.reduce((s, i) => s + i.totalPrice, 0),
        fishWeightKg: weighings.reduce((s, w) => s + w.weightKg, 0),
        discountType,
        discountValue,
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
        return tx.order.update({
          where: { id },
          data: { status: "CANCELLED" },
          include: ORDER_INCLUDE,
        });
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Admin update order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update order" },
      { status: 500 },
    );
  }
}
