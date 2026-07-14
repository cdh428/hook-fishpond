import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;

    // Get successful payments in date range
    const payments = await prisma.payment.findMany({
      where: {
        status: "SUCCESSFUL",
        paidAt: { gte: start, lte: end },
      },
      include: {
        order: {
          include: {
            items: { include: { menuItem: true } },
            bookings: { include: { pond: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    });

    // Calculate totals
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    // Breakdown by payment method
    const byMethod: Record<string, number> = {};
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
    }

    // Breakdown by day
    const byDay: Record<string, number> = {};
    for (const p of payments) {
      if (p.paidAt) {
        const day = p.paidAt.toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + p.amount;
      }
    }

    // Booking revenue (from bookings that are confirmed/non-cancelled)
    const bookings = await prisma.booking.findMany({
      where: {
        status: { not: "CANCELLED" },
        createdAt: { gte: start, lte: end },
      },
      include: { pond: true },
    });

    const bookingRevenue = bookings.reduce((sum, b) => sum + b.totalPrice, 0);

    return NextResponse.json({
      dateRange: { start, end },
      totalRevenue,
      bookingRevenue,
      orderRevenue: totalRevenue,
      paymentMethodBreakdown: byMethod,
      dailyBreakdown: byDay,
      transactionCount: payments.length,
      bookingCount: bookings.length,
      transactions: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        method: p.method,
        amount: p.amount,
        status: p.status,
        paidAt: p.paidAt,
        customerName: p.order.customerName,
        customerPhone: p.order.customerPhone,
      })),
    });
  } catch (error: any) {
    console.error("Admin transactions error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get transactions" },
      { status: 500 },
    );
  }
}
