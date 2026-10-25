import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { runTx } from "@/lib/tx";
import { OPEN_ORDER_STATUSES, generateOrderNumber, recalcOrderTotals } from "@/lib/orders";
import { bangkokDayRange, reserveStock, InsufficientStockError } from "@/lib/stock";
import { resolveOrderLines, OptionError } from "@/lib/menu-options-server";

/**
 * GET /api/admin/orders
 *
 * 后台订单看板数据源。支持：
 *  - status=PENDING|PREPARING|READY|SERVED|SETTLED|CANCELLED|PAID
 *  - scope=open        只取进行中（未取消、未结清）
 *  - scope=awaiting    只取待收款（后付且未结清）
 *  - scope=today       只取曼谷「今天」的订单
 *  - startDate / endDate
 *
 * 订单状态语义：PENDING → PREPARING → READY → SERVED → SETTLED（终态）；
 * CANCELLED 为异常终态；PAID 为历史遗留值。
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const scope = searchParams.get("scope");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: any = {};
    if (status) where.status = status;

    if (scope === "open") {
      where.status = { in: [...OPEN_ORDER_STATUSES] };
    } else if (scope === "awaiting") {
      // 待结算 = **所有未结清的单**，不分先付/后付。
      // 旧写法只取 POSTPAID，导致「已预付一部分、还没称重/没结清」的单（如 FP-20261017-006）
      // 从收款台消失 → 收不到尾款。这里不过滤 settlementMode，交给前端分组显示。
      where.status = { notIn: ["SETTLED", "CANCELLED"] };
    } else if (scope === "today") {
      const { start, end } = bangkokDayRange();
      where.createdAt = { gte: start, lt: end };
    } else if (scope === "unsettled") {
      // 未结清：不做日期限制。跨天未结的桌必须一直出现在后台，直到结清或取消，
      // 否则隔天就「消失」，收不到钱也结不掉。
      where.status = { notIn: ["SETTLED", "CANCELLED"] };
    }

    if (startDate || endDate) {
      where.createdAt = where.createdAt ?? {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            menuItem: {
              select: { name_zh: true, name_en: true, name_th: true },
            },
          },
        },
        bookings: { include: { pond: true } },
        weighings: { orderBy: { createdAt: "asc" } },
        payment: true,
        table: true,
        // 收款流水：时间正序（当账本读）。列表卡片显示「几点收了多少钱」靠它。
        paymentRecords: {
          where: { voidedAt: null },
          orderBy: { paidAt: "asc" },
          select: {
            id: true,
            amount: true,
            method: true,
            kind: true,
            operator: true,
            note: true,
            paidAt: true,
          },
        },
      },
      // 财务口径：按**最近一次变动**排序，而不是按开单时间。
      // 同一张单顾客又加了菜、或店员记了一笔定金，它应当立刻浮到最上，
      // 否则会被压在老单里，店员找不到刚动过的那张。updatedAt 由 @updatedAt 自动维护。
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });

    // 统计口径：进行中 / 待收款 的数量与金额（用于看板顶部）
    const openOrders = orders.filter(
      (o) => !["SETTLED", "CANCELLED"].includes(o.status),
    );
    const awaiting = openOrders;
    // 实收取自流水（与 Order.prepaidAmount 同源，但更可信：能排除已作废的行）
    const collectedOf = (o: (typeof orders)[number]) =>
      Math.round(
        (o.paymentRecords ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100,
      ) / 100;
    const summary = {
      open: openOrders.length,
      awaitingCount: awaiting.length,
      // 待收金额按「需付」累计，而不是按全额——已付过的部分不能重复算
      awaitingAmount:
        Math.round(
          awaiting.reduce(
            (s, o) => s + Math.max(0, o.totalPrice - collectedOf(o)),
            0,
          ) * 100,
        ) / 100,
      // 已付合计：收款台/看板可以直接看到「今天手上有多少钱还没结单」
      awaitingPrepaid:
        Math.round(awaiting.reduce((s, o) => s + collectedOf(o), 0) * 100) / 100,
      unsettledPrepaid: openOrders.filter((o) => o.settlementMode === "PREPAID").length,
      // 明细：有预付但未结清的单（前端分组「已付未结清」用）
      partiallyPaidCount: openOrders.filter((o) => collectedOf(o) > 0).length,
    };

    return NextResponse.json({ orders, summary });
  } catch (error: any) {
    console.error("Admin list orders error:", error);
    return NextResponse.json(
      { error: "Failed to list orders" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/orders —— 后台手动新建订单（补录）
 *
 * 与顾客端 POST /api/orders 的区别：
 *  - 无需顾客身份（userId 可空），customerName 默认「补录」；
 *  - 可选 orderDate：把订单 createdAt 落到过去的某个时刻（不能是未来日期），
 *    订单号序号按所选曼谷日的已有单数重新计算 → 历史日报表自动正确；
 *  - autoPrintFired 保持默认 false → 补录单会触发自动出单（POS80 打票 + 播报）。
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { items, note, tableCode, orderDate, orderType, settlementMode } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: items[]" },
        { status: 400 },
      );
    }

    const type: "DINE_IN" | "TAKEAWAY" =
      orderType === "TAKEAWAY" ? "TAKEAWAY" : "DINE_IN";
    const mode: "PREPAID" | "POSTPAID" =
      settlementMode === "PREPAID" ? "PREPAID" : "POSTPAID";

    // 补录日期：可选；只能是过去（60 秒容差），不能是未来
    let createdAtOverride: Date | null = null;
    if (orderDate) {
      const d = new Date(String(orderDate));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid orderDate", code: "INVALID_DATE" }, { status: 400 });
      }
      if (d.getTime() > Date.now() + 60_000) {
        return NextResponse.json(
          { error: "Order date cannot be in the future", code: "FUTURE_DATE_REJECTED" },
          { status: 400 },
        );
      }
      createdAtOverride = d;
    }

    // 桌号解析：堂食必填有效启用中的桌；外带不挂桌
    let tableId: string | null = null;
    if (type === "DINE_IN") {
      if (!tableCode) {
        return NextResponse.json(
          { error: "Dine-in orders require a tableCode", code: "TABLE_REQUIRED" },
          { status: 400 },
        );
      }
      const table = await prisma.diningTable.findUnique({
        where: { code: String(tableCode).toUpperCase() },
      });
      if (!table || !table.isActive) {
        return NextResponse.json(
          { error: "Invalid or inactive table code", code: "INVALID_TABLE" },
          { status: 400 },
        );
      }
      tableId = table.id;
    }

    let order: { id: string } | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await runTx(async (tx) => {
          const { lines, subtotal } = await resolveOrderLines(tx, items);

          const orderNumber = await generateOrderNumber(
            tx,
            attempt,
            createdAtOverride ?? undefined,
          );

          const newOrder = await tx.order.create({
            data: {
              orderNumber,
              userId: null,
              tableId,
              customerName: body.customerName || "补录",
              customerPhone: body.customerPhone || null,
              subtotal,
              totalPrice: subtotal,
              note: note || null,
              orderType: type,
              settlementMode: mode,
              status: "PENDING",
              // 补录：把开单时间落到所选时刻（报表按 createdAt 落日 → 历史日报自动重算）
              ...(createdAtOverride
                ? { createdAt: createdAtOverride, updatedAt: createdAtOverride }
                : {}),
              items: {
                create: lines.map((l) => ({
                  menuItemId: l.menuItemId,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  totalPrice: l.totalPrice,
                  optionKey: l.optionKey,
                  note: l.note,
                  ...(l.options
                    ? { options: l.options as unknown as Prisma.InputJsonValue }
                    : {}),
                })),
              },
            },
            include: { items: true },
          });

          // 下单即预占库存（不足时事务内抛 InsufficientStockError，整体回滚）
          await reserveStock(
            tx,
            newOrder.id,
            newOrder.items.map((it) => ({
              menuItemId: it.menuItemId,
              quantity: it.quantity,
              optionKey: it.optionKey,
              orderItemId: it.id,
            })),
          );

          await recalcOrderTotals(tx, newOrder.id);

          return newOrder;
        });
        break;
      } catch (e: any) {
        lastError = e;
        if (e?.code === "P2002") continue;
        throw e;
      }
    }
    if (!order) throw lastError ?? new Error("Failed to create order");

    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: { include: { menuItem: true } },
        bookings: true,
        weighings: true,
        table: true,
        paymentRecords: { where: { voidedAt: null }, orderBy: { paidAt: "asc" } },
      },
    });

    return NextResponse.json(fullOrder || order, { status: 201 });
  } catch (error: any) {
    if (error instanceof OptionError) {
      return NextResponse.json(
        { error: error.humanMessage, code: error.code },
        { status: 400 },
      );
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `${error.itemName} 库存不足，请调整数量`, code: "INSUFFICIENT_STOCK" },
        { status: 400 },
      );
    }
    console.error("Admin create order error:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 },
    );
  }
}
