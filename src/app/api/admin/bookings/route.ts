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
    const status = searchParams.get("status");

    let query = supabase
      .from("Booking")
      .select("*, pond:Pond(*), spot:Spot(*), user:User(*), order:Order(*)")
      .order("createdAt", { ascending: false });

    if (startDate) {
      query = query.gte("date", new Date(startDate).toISOString());
    }
    if (endDate) {
      query = query.lte("date", new Date(endDate).toISOString());
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: bookings, error } = await query;

    if (error) throw error;

    return NextResponse.json(bookings || []);
  } catch (error: any) {
    console.error("Admin list bookings error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list bookings" },
      { status: 500 },
    );
  }
}
