import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { data: booking, error } = await supabase
      .from("Booking")
      .select("*, pond:Pond(*), spot:Spot(*), order:Order(*, items:OrderItem(*, menuItem:MenuItem(*)))")
      .eq("id", id)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    return NextResponse.json(booking);
  } catch (error: any) {
    console.error("Get booking error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get booking" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { status } = await request.json();

    if (!["PENDING", "CONFIRMED", "CANCELLED"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be PENDING, CONFIRMED, or CANCELLED" },
        { status: 400 },
      );
    }

    const { data: booking, error } = await supabase
      .from("Booking")
      .update({ status })
      .eq("id", id)
      .select("*, pond:Pond(*), spot:Spot(*)")
      .single();

    if (error) throw error;

    return NextResponse.json(booking);
  } catch (error: any) {
    console.error("Update booking error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update booking" },
      { status: 500 },
    );
  }
}
