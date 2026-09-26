import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

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

    // Today's revenue (from successful payments)
    const payments = await prisma.payment.findMany({
      where: {
        status: "SUCCESSFUL",
        paidAt: { gte: todayStart, lt: todayEnd },
      },
      select: { amount: true },
    });

    const todayRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

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
      todayRevenue,
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
