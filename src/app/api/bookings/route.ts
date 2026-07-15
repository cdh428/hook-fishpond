import { NextRequest, NextResponse } from "next/server";
import { supabase, genId } from "@/lib/supabase-server";

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

    const { data: pond, error: pondError } = await supabase
      .from("Pond")
      .select("*")
      .eq("id", pondId)
      .single();

    if (pondError || !pond || !pond.isActive) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    if (pond.type === "LEISURE") {
      if (!spotId || !timeSlot) {
        return NextResponse.json(
          { error: "Leisure booking requires spotId and timeSlot" },
          { status: 400 },
        );
      }

      // Check spot is not already booked for this date+timeSlot
      const dateStr = bookingDate.toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from("Booking")
        .select("*")
        .eq("spotId", spotId)
        .eq("timeSlot", timeSlot)
        .gte("date", dateStr + "T00:00:00")
        .lt("date", dateStr + "T23:59:59")
        .neq("status", "CANCELLED")
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: "This spot is already booked for the selected time slot" },
          { status: 409 },
        );
      }

      const bookingId = genId();
      const { data: booking, error: createError } = await supabase
        .from("Booking")
        .insert({
          id: bookingId,
          userId: userId || null,
          pondId,
          spotId,
          date: bookingDate.toISOString(),
          timeSlot,
          customerName,
          customerPhone,
          totalPrice: pond.price,
          status: "PENDING",
        })
        .select("*")
        .single();

      if (createError) throw createError;

      // Fetch with relations
      const { data: fullBooking } = await supabase
        .from("Booking")
        .select("*, pond:Pond(*), spot:Spot(*)")
        .eq("id", bookingId)
        .single();

      return NextResponse.json(fullBooking || booking, { status: 201 });
    } else {
      // Competition group booking
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

      const bookingId = genId();
      const { data: booking, error: createError } = await supabase
        .from("Booking")
        .insert({
          id: bookingId,
          userId: userId || null,
          pondId,
          spotId: spotId || null,
          date: bookingDate.toISOString(),
          timeSlot: "FULL_DAY",
          participantCount,
          groupName,
          customerName,
          customerPhone,
          totalPrice: pond.price * participantCount,
          status: "PENDING",
        })
        .select("*")
        .single();

      if (createError) throw createError;

      const { data: fullBooking } = await supabase
        .from("Booking")
        .select("*, pond:Pond(*), spot:Spot(*)")
        .eq("id", bookingId)
        .single();

      return NextResponse.json(fullBooking || booking, { status: 201 });
    }
  } catch (error: any) {
    console.error("Create booking error:", error);
    // Handle unique constraint violation (double-booking)
    if (error?.message?.includes("unique constraint") || error?.code === "23505") {
      return NextResponse.json(
        { error: "This spot is already booked for the selected time slot" },
        { status: 409 },
      );
    }
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

    let query = supabase
      .from("Booking")
      .select("*, pond:Pond(*), spot:Spot(*), order:Order(*)")
      .order("createdAt", { ascending: false });

    if (userId) {
      query = query.eq("userId", userId);
    } else {
      query = query.eq("customerPhone", phone!);
    }

    const { data: bookings, error } = await query;

    if (error) throw error;

    return NextResponse.json(bookings || []);
  } catch (error: any) {
    console.error("List bookings error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list bookings" },
      { status: 500 },
    );
  }
}
