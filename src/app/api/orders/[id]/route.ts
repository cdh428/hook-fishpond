import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { data: order, error } = await supabase
      .from("Order")
      .select("*, items:OrderItem(*, menuItem:MenuItem(*)), payment:Payment(*), bookings:Booking(*, pond:Pond(*), spot:Spot(*))")
      .eq("id", id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Get order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get order" },
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

    const validStatuses = ["PENDING", "PAID", "PREPARING", "READY", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }

    const { data: order, error } = await supabase
      .from("Order")
      .update({ status })
      .eq("id", id)
      .select("*, items:OrderItem(*, menuItem:MenuItem(*)), payment:Payment(*)")
      .single();

    if (error) throw error;

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Update order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update order" },
      { status: 500 },
    );
  }
}
