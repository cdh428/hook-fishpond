import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    if (!dateParam) {
      return NextResponse.json(
        { error: "Missing required query param: date" },
        { status: 400 },
      );
    }

    const date = new Date(dateParam);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 },
      );
    }

    const pond = await prisma.pond.findUnique({ where: { id } });
    if (!pond) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    const spots = await prisma.spot.findMany({
      where: { pondId: id, isActive: true },
      orderBy: { number: "asc" },
    });

    // Find bookings for this pond on this date (non-cancelled)
    const bookings = await prisma.booking.findMany({
      where: {
        pondId: id,
        date,
        status: { not: "CANCELLED" },
      },
      select: { spotId: true, timeSlot: true },
    });

    // Build availability map
    // For LEISURE: spot is booked per timeSlot
    // For COMPETITION: spot is booked for the whole day
    const bookedKeys = new Set<string>();
    for (const b of bookings) {
      if (b.spotId) {
        bookedKeys.add(`${b.spotId}:${b.timeSlot || "FULL_DAY"}`);
      }
    }

    const spotsWithAvailability = spots.map((spot) => {
      const slots =
        pond.type === "LEISURE"
          ? ["MORNING", "AFTERNOON", "EVENING", "FULL_DAY"]
          : ["FULL_DAY"];

      const availability: Record<string, boolean> = {};
      for (const slot of slots) {
        availability[slot] = !bookedKeys.has(`${spot.id}:${slot}`);
      }

      return {
        ...spot,
        available: pond.type === "COMPETITION" ? availability["FULL_DAY"] : Object.values(availability).some(Boolean),
        slotAvailability: availability,
      };
    });

    return NextResponse.json({
      pond,
      spots: spotsWithAvailability,
    });
  } catch (error: any) {
    console.error("List spots error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list spots" },
      { status: 500 },
    );
  }
}
