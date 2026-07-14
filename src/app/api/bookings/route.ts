import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      pondId,
      spotId,
      date,
      timeSlot,
      participantCount,
      groupName,
      customerName,
      customerPhone,
      userId,
    } = body;

    if (!pondId || !date || !customerName || !customerPhone) {
      return NextResponse.json(
        { error: "Missing required fields: pondId, date, customerName, customerPhone" },
        { status: 400 },
      );
    }

    const pond = await prisma.pond.findUnique({ where: { id: pondId } });
    if (!pond || !pond.isActive) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    if (pond.type === "LEISURE") {
      // Individual booking — requires spotId and timeSlot
      if (!spotId || !timeSlot) {
        return NextResponse.json(
          { error: "Leisure booking requires spotId and timeSlot" },
          { status: 400 },
        );
      }

      // Check spot is not already booked for this date+timeSlot
      const existing = await prisma.booking.findUnique({
        where: {
          spotId_date_timeSlot: { spotId, date: bookingDate, timeSlot },
        },
      });
      if (existing && existing.status !== "CANCELLED") {
        return NextResponse.json(
          { error: "This spot is already booked for the selected time slot" },
          { status: 409 },
        );
      }

      const booking = await prisma.booking.create({
        data: {
          userId: userId || null,
          pondId,
          spotId,
          date: bookingDate,
          timeSlot,
          customerName,
          customerPhone,
          totalPrice: pond.price,
          status: "PENDING",
        },
        include: { pond: true, spot: true },
      });

      return NextResponse.json(booking, { status: 201 });
    } else {
      // Competition group booking — requires participantCount and groupName
      if (!participantCount || !groupName) {
        return NextResponse.json(
          { error: "Competition booking requires participantCount and groupName" },
          { status: 400 },
        );
      }

      const minParticipants = pond.minParticipants || 10;
      if (participantCount < minParticipants) {
        return NextResponse.json(
          { error: `Minimum ${minParticipants} participants required for competition pond` },
          { status: 400 },
        );
      }

      const booking = await prisma.booking.create({
        data: {
          userId: userId || null,
          pondId,
          spotId: spotId || null,
          date: bookingDate,
          timeSlot: "FULL_DAY",
          participantCount,
          groupName,
          customerName,
          customerPhone,
          totalPrice: pond.price * participantCount,
          status: "PENDING",
        },
        include: { pond: true, spot: true },
      });

      return NextResponse.json(booking, { status: 201 });
    }
  } catch (error: any) {
    console.error("Create booking error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create booking" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const phone = searchParams.get("phone");

    if (!userId && !phone) {
      return NextResponse.json(
        { error: "Provide userId or phone query parameter" },
        { status: 400 },
      );
    }

    const where = userId
      ? { userId }
      : { customerPhone: phone! };

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        pond: true,
        spot: true,
        order: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(bookings);
  } catch (error: any) {
    console.error("List bookings error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list bookings" },
      { status: 500 },
    );
  }
}
