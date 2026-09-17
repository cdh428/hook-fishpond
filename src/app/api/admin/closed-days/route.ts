import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isMonday, toDateValue } from "@/lib/date-utils";

/**
 * Admin — create (or upsert) a statutory holiday / extra closed day.
 * Every Monday is already closed by rule; the API rejects Monday dates.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { date, reason_zh, reason_en, reason_th } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format, expected YYYY-MM-DD" },
        { status: 400 },
      );
    }

    if (isMonday(date)) {
      return NextResponse.json(
        { error: "Monday is already closed" },
        { status: 400 },
      );
    }

    const value = toDateValue(date);

    const closedDay = await prisma.closedDay.upsert({
      where: { date: value },
      update: {
        reason_zh: reason_zh ?? null,
        reason_en: reason_en ?? null,
        reason_th: reason_th ?? null,
      },
      create: {
        date: value,
        reason_zh: reason_zh ?? null,
        reason_en: reason_en ?? null,
        reason_th: reason_th ?? null,
      },
    });

    return NextResponse.json(
      {
        id: closedDay.id,
        date: closedDay.date.toISOString().slice(0, 10),
        reason_zh: closedDay.reason_zh ?? undefined,
        reason_en: closedDay.reason_en ?? undefined,
        reason_th: closedDay.reason_th ?? undefined,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Create closed day error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create closed day" },
      { status: 500 },
    );
  }
}
