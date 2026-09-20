import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildReport, type ReportRange, type TrendGrain } from "@/lib/reports";

export const dynamic = "force-dynamic";

const RANGES: ReportRange[] = ["today", "week", "month", "custom"];
const GRAINS: TrendGrain[] = ["day", "week", "month"];

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rangeParam = (searchParams.get("range") || "today") as ReportRange;
    const range = RANGES.includes(rangeParam) ? rangeParam : "today";

    const grainParam = searchParams.get("grain") as TrendGrain | null;
    const grain = grainParam && GRAINS.includes(grainParam) ? grainParam : null;

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (range === "custom" && (!from || !to)) {
      return NextResponse.json(
        { error: "from / to are required for a custom range" },
        { status: 400 },
      );
    }

    const data = await buildReport(range, { from, to, grain });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Report error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to build report" },
      { status: 500 },
    );
  }
}
