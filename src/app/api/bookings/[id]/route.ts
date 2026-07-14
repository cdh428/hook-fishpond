import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        pond: true,
        spot: true,
        order: { include: { items: { include: { menuItem: true } } } },
      },
    });

    if (!booking) {
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

    const booking = await prisma.booking.update({
      where: { id },
      data: { status },
      include: { pond: true, spot: true },
    });

    return NextResponse.json(booking);
  } catch (error: any) {
    console.error("Update booking error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update booking" },
      { status: 500 },
    );
  }
}
