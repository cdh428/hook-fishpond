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
      where.status = { notIn: ["SETTLED", "CANCELLED"] };
      where.settlementMode = "POSTPAID";
    } else if (scope === "today") {
      const { start, end } = bangkokDayRange();
      where.createdAt = { gte: start, lt: end };
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
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // 统计口径：进行中 / 待收款 的数量与金额（用于看板顶部）
    const openOrders = orders.filter(
      (o) => !["SETTLED", "CANCELLED"].includes(o.status),
    );
    const awaiting = openOrders.filter((o) => o.settlementMode === "POSTPAID");
    const summary = {
      open: openOrders.length,
      awaitingCount: awaiting.length,
      awaitingAmount: awaiting.reduce((s, o) => s + o.totalPrice, 0),
      unsettledPrepaid: openOrders.filter((o) => o.settlementMode === "PREPAID").length,
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
