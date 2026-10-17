import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { OPEN_ORDER_STATUSES } from "@/lib/orders";
import { bangkokDayRange } from "@/lib/stock";

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
