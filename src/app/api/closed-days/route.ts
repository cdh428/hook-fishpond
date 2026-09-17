import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bangkokDateString, toDateValue } from "@/lib/date-utils";

/**
 * Public — list every closed day (statutory holidays) for a given year.
 *
 * Response: { mondayClosed: true, days: ApiClosedDay[] }
 * `mondayClosed` is always true (every Monday is a hard-coded rest day);
 * `days` are the admin-configured statutory holidays for the year.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam
      ? parseInt(yearParam, 10)
      : parseInt(bangkokDateString().slice(0, 4), 10);

    const days = await prisma.closedDay.findMany({
      where: {
        date: {
          gte: toDateValue(`${year}-01-01`),
          lte: toDateValue(`${year}-12-31`),
        },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({
      mondayClosed: true,
      days: days.map((d) => ({
        id: d.id,
        date: d.date.toISOString().slice(0, 10),
        reason_zh: d.reason_zh ?? undefined,
        reason_en: d.reason_en ?? undefined,
        reason_th: d.reason_th ?? undefined,
      })),
    });
  } catch (error: any) {
    console.error("List closed days error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list closed days" },
      { status: 500 },
    );
  }
}
