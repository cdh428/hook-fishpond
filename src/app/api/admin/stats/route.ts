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

    // Pending orders count
    const pendingOrders = await prisma.order.count({
      where: { status: "PENDING" },
    });

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
    });
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get stats" },
      { status: 500 },
    );
  }
}
