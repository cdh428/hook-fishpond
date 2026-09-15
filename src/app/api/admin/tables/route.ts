import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * Admin — list all dining tables (active + inactive) and create new ones.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tables = await prisma.diningTable.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: { select: { orders: true } },
      },
    });

    return NextResponse.json(tables);
  } catch (error: any) {
    console.error("List admin tables error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list tables" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { code, name_zh, name_en, name_th, area } = body;

    if (!code || !name_zh || !name_en || !name_th || !area) {
      return NextResponse.json(
        { error: "Missing required fields: code, name_zh, name_en, name_th, area" },
        { status: 400 },
      );
    }

    if (area !== "HUT" && area !== "CAFE") {
      return NextResponse.json({ error: "area must be HUT or CAFE" }, { status: 400 });
    }

    const normalizedCode = String(code).toUpperCase().trim();

    const existing = await prisma.diningTable.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Table code ${normalizedCode} already exists` },
        { status: 409 },
      );
    }

    const table = await prisma.diningTable.create({
      data: {
        code: normalizedCode,
        name_zh,
        name_en,
        name_th,
        area,
      },
    });

    return NextResponse.json(table, { status: 201 });
  } catch (error: any) {
    console.error("Create table error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create table" },
      { status: 500 },
    );
  }
}
