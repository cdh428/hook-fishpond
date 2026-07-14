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

    // Today's bookings count
    const todayBookings = await prisma.booking.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
        status: { not: "CANCELLED" },
      },
    });

    // Today's revenue (from paid orders)
    const todayRevenueResult = await prisma.payment.aggregate({
      where: {
        status: "SUCCESSFUL",
        paidAt: { gte: todayStart, lt: todayEnd },
      },
      _sum: { amount: true },
    });

    // Pending orders count
    const pendingOrders = await prisma.order.count({
      where: { status: "PENDING" },
    });

    // Active spots count
    const activeSpots = await prisma.spot.count({
      where: { isActive: true },
    });

    // Total bookings today (including cancelled for reference)
    const totalTodayBookings = await prisma.booking.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });

    return NextResponse.json({
      todayBookings,
      todayRevenue: todayRevenueResult._sum.amount || 0,
      pendingOrders,
      activeSpots,
      totalTodayBookings,
    });
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get stats" },
      { status: 500 },
    );
  }
}
