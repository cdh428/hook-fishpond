import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
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
    const start = startDate ? new Date(startDate).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = endDate ? new Date(endDate).toISOString() : now.toISOString();

    // Get successful payments in date range
    const { data: payments, error } = await supabase
      .from("Payment")
      .select("*, order:Order(*, items:OrderItem(*, menuItem:MenuItem(*)), bookings:Booking(*, pond:Pond(*)))")
      .eq("status", "SUCCESSFUL")
      .gte("paidAt", start)
      .lte("paidAt", end)
      .order("paidAt", { ascending: false });

    if (error) throw error;

    const allPayments = payments || [];

    // Calculate totals
    const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0);

    // Breakdown by payment method
    const byMethod: Record<string, number> = {};
    for (const p of allPayments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
    }

    // Breakdown by day
    const byDay: Record<string, number> = {};
    for (const p of allPayments) {
      if (p.paidAt) {
        const day = p.paidAt.slice(0, 10);
        byDay[day] = (byDay[day] || 0) + p.amount;
      }
    }

    // Booking revenue (from bookings that are confirmed/non-cancelled)
    const { data: bookings } = await supabase
      .from("Booking")
      .select("*, pond:Pond(*)")
      .neq("status", "CANCELLED")
      .gte("createdAt", start)
      .lte("createdAt", end);

    const allBookings = bookings || [];
    const bookingRevenue = allBookings.reduce((sum, b) => sum + b.totalPrice, 0);

    return NextResponse.json({
      dateRange: { start, end },
      totalRevenue,
      bookingRevenue,
      orderRevenue: totalRevenue,
      paymentMethodBreakdown: byMethod,
      dailyBreakdown: byDay,
      transactionCount: allPayments.length,
      bookingCount: allBookings.length,
      transactions: allPayments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order?.orderNumber,
        method: p.method,
        amount: p.amount,
        status: p.status,
        paidAt: p.paidAt,
        customerName: p.order?.customerName,
        customerPhone: p.order?.customerPhone,
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
