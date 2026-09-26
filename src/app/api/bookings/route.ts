import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isClosedDate } from "@/lib/closed-days";
import { isTodayCutoff, SAME_DAY_CUTOFF_HOUR } from "@/lib/date-utils";
import { requireAdmin, getUserFromRequest } from "@/lib/auth";

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

    const pond = await prisma.pond.findUnique({
      where: { id: pondId },
    });

    if (!pond || !pond.isActive) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // Reject bookings on any closed day (Monday or statutory holiday)
    const dateStr = String(date).slice(0, 10);
    const closed = await isClosedDate(dateStr);
    if (closed) {
      return NextResponse.json(
        { error: "The venue is closed on this date" },
        { status: 400 },
      );
    }

    // Same-day cut-off: from SAME_DAY_CUTOFF_HOUR (venue time) onward, online
    // booking for *today* is closed — walk-ins / phone only. Other dates are
    // unaffected, and staff-created bookings go through a separate admin route.
    if (isTodayCutoff(dateStr)) {
      return NextResponse.json(
        { error: "ERR_SAME_DAY_CUTOFF", cutoffHour: SAME_DAY_CUTOFF_HOUR },
        { status: 400 },
      );
    }

    if (pond.type === "LEISURE") {
      if (!spotId || !timeSlot) {
        return NextResponse.json(
          { error: "Leisure booking requires spotId and timeSlot" },
          { status: 400 },
        );
      }

      // Check spot is not already booked for this date+timeSlot
      const existing = await prisma.booking.findFirst({
        where: {
          spotId,
          timeSlot,
          date: bookingDate,
          status: { not: "CANCELLED" },
        },
      });

      if (existing) {
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
    // Handle unique constraint violation (double-booking)
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "This spot is already booked for the selected time slot" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/bookings —— 查预约列表
 *
 * ⚠️ 安全口径（2026-09-26 收紧）：
 *  - **已移除 `?phone=` 查询**。原因：手机号是可枚举的，任何人都能拿一串号码把
 *    别人的姓名 / 日期 / 人数 / 历史刷出来；而前端从来没用过这个参数。
 *  - 顾客端身份**只认 `x-user-id` 请求头**，查询串里的 `userId` 必须与之一致；
 *    不允许「只凭 URL 上的 userId 就取别人的数据」。
 *  - 管理端（带 `admin-session`）可按任意 userId 查。
 *  - 这仍是**缓解**不是修复：x-user-id 可伪造。真正的修法是给顾客上 OTP。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");

    const admin = await requireAdmin(request);
    if (admin) {
      if (!requestedUserId) {
        return NextResponse.json(
          { error: "Provide userId query parameter" },
          { status: 400 },
        );
      }
      const bookings = await prisma.booking.findMany({
        where: { userId: requestedUserId },
        include: { pond: true, spot: true, order: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(bookings);
    }

    const me = await getUserFromRequest(request);
    if (!me) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (requestedUserId && requestedUserId !== me.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bookings = await prisma.booking.findMany({
      where: { userId: me.id },
      include: { pond: true, spot: true, order: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(bookings);
  } catch (error: any) {
    console.error("List bookings error:", error);
    return NextResponse.json(
      { error: "Failed to list bookings" },
      { status: 500 },
    );
  }
}
