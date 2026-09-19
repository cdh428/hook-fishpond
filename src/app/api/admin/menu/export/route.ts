import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildExportRows, toCsv, dateStamp } from "@/lib/menu-io";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";

    const items = await prisma.menuItem.findMany({
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });

    const date = dateStamp();

    if (format === "csv") {
      const csv = toCsv(buildExportRows(items as any));
      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="menu-${date}.csv"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Menu");
    const rows = buildExportRows(items as any);
    ws.addRows(rows);
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="menu-${date}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("Export menu error:", error);
    return NextResponse.json(
      { error: error.message || "导出失败" },
      { status: 500 },
    );
  }
}
