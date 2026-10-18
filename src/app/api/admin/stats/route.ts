import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sumCollected } from "@/lib/payment-records";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Today's bookings count (non-cancelled)
    const todayBookings = await prisma.booking.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
        status: { not: "CANCELLED" },
      },
    });

    // 今日「进入收款」= 今天实际收到的钱（不管订单是否结清）。
    // 口径：今天全部有效 PaymentRecord（现金 / PromptPay / 其它）之和。
    // 不查 Payment.amount——那现在存的是「本次结清补差额」，语义已不是「收到多少」。
    // 作废流水（voidedAt）剔除；退款（amount<0 的 REFUND）抵减。
    const todayCollectedAgg = await prisma.paymentRecord.aggregate({
      where: {
        voidedAt: null,
        paidAt: { gte: todayStart, lt: todayEnd },
      },
      _sum: { amount: true },
    });
    const todayCollected = Math.round((todayCollectedAgg._sum.amount ?? 0) * 100) / 100;

    // 「进行中订单金额」= 未结清订单的「还需付」差额（总应付 − 已付实收）求和。
    // 这是"还没到手、但预计会收到"的部分。已付靠流水实收（sumCollected）扣减。
    const openOrders = await prisma.order.findMany({
      where: { status: { notIn: ["SETTLED", "CANCELLED"] } },
      select: { id: true, totalPrice: true },
    });
    let openOutstanding = 0;
    let openOutstandingCount = 0;
    for (const o of openOrders) {
      const prepaid = Math.min(await sumCollected(prisma, o.id), o.totalPrice);
      const outstanding = Math.round(Math.max(0, o.totalPrice - prepaid) * 100) / 100;
      if (outstanding > 0) {
        openOutstanding += outstanding;
        openOutstandingCount += 1;
      }
    }
    openOutstanding = Math.round(openOutstanding * 100) / 100;

    // 「今天预计收入」= 已到手（todayCollected）+ 预计会到手（openOutstanding）
    const todayProjected = Math.round((todayCollected + openOutstanding) * 100) / 100;

    // 进行中订单（已下单但未结清、未取消）—— 后厨看板口径
    const pendingOrders = await prisma.order.count({
      where: {
        status: { in: ["PENDING", "PREPARING", "READY", "SERVED"] },
      },
    });

    // 待收款订单（后付且未结清）
    const awaitingRows = await prisma.order.findMany({
      where: {
        settlementMode: "POSTPAID",
        status: { notIn: ["SETTLED", "CANCELLED"] },
      },
      select: { totalPrice: true },
    });
    const awaitingSettlementCount = awaitingRows.length;
    const awaitingSettlementAmount = awaitingRows.reduce(
      (sum, o) => sum + o.totalPrice,
      0,
    );

    // 今日渔获（用于仪表盘提示）
    const todayOrders = await prisma.order.findMany({
      where: {
        status: { not: "CANCELLED" },
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      select: { fishWeightKg: true, fishCharge: true, discountAmount: true },
    });
    const todayFishKg = todayOrders.reduce((s, o) => s + (o.fishWeightKg || 0), 0);
    const todayFishCharge = todayOrders.reduce((s, o) => s + (o.fishCharge || 0), 0);
    const todayDiscount = todayOrders.reduce((s, o) => s + (o.discountAmount || 0), 0);

    // Active spots count
    const activeSpots = await prisma.spot.count({
      where: { isActive: true },
    });

    // Total bookings today (including cancelled)
    const totalTodayBookings = await prisma.booking.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });

    return NextResponse.json({
      todayBookings: todayBookings || 0,
      // todayRevenue 现语义 = 「今天进入收款」= 今日实际收到（Σ 有效流水），保留字段名避免前端断
      todayRevenue: todayCollected,
      todayCollected,
      // 进行中订单的「还需付」差额（未结清单：总应付 − 已付）
      openOutstanding,
      openOutstandingCount,
      // 「今天预计收入」= 已到手 + 预计会到手
      todayProjected,
      pendingOrders: pendingOrders || 0,
      activeSpots: activeSpots || 0,
      totalTodayBookings: totalTodayBookings || 0,
      awaitingSettlementCount,
      awaitingSettlementAmount,
      todayFishKg,
      todayFishCharge,
      todayDiscount,
    });
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Failed to get stats" },
      { status: 500 },
    );
  }
}
