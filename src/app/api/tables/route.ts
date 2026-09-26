import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public endpoint — used by the QR landing page (/t/[code]) to validate a table code.
 *
 * GET /api/tables                → list all active tables (for validation/lookup)
 * GET /api/tables?code=A01       → single table by code
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (code) {
      const table = await prisma.diningTable.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (!table || !table.isActive) {
        return NextResponse.json({ error: "Table not found" }, { status: 404 });
      }

      return NextResponse.json(table);
    }

    const tables = await prisma.diningTable.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(tables);
  } catch (error: any) {
    console.error("List tables error:", error);
    return NextResponse.json(
      { error: "Failed to list tables" },
      { status: 500 },
    );
  }
}
