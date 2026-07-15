import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
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
    const todayStartStr = todayStart.toISOString();
    const todayEndStr = todayEnd.toISOString();

    // Today's bookings count (non-cancelled)
    const { count: todayBookings } = await supabase
      .from("Booking")
      .select("*", { count: "exact", head: true })
      .gte("createdAt", todayStartStr)
      .lt("createdAt", todayEndStr)
      .neq("status", "CANCELLED");

    // Today's revenue (from successful payments)
    const { data: payments } = await supabase
      .from("Payment")
      .select("amount")
      .eq("status", "SUCCESSFUL")
      .gte("paidAt", todayStartStr)
      .lt("paidAt", todayEndStr);

    const todayRevenue = (payments || []).reduce((sum, p) => sum + p.amount, 0);

    // Pending orders count
    const { count: pendingOrders } = await supabase
      .from("Order")
      .select("*", { count: "exact", head: true })
      .eq("status", "PENDING");

    // Active spots count
    const { count: activeSpots } = await supabase
      .from("Spot")
      .select("*", { count: "exact", head: true })
      .eq("isActive", true);

    // Total bookings today (including cancelled)
    const { count: totalTodayBookings } = await supabase
      .from("Booking")
      .select("*", { count: "exact", head: true })
      .gte("createdAt", todayStartStr)
      .lt("createdAt", todayEndStr);

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
