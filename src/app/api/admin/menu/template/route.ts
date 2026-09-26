import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { buildTemplateRows, toCsv, dateStamp } from "@/lib/menu-io";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";

    const date = dateStamp();

    if (format === "csv") {
      const csv = toCsv(buildTemplateRows());
      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="menu-template-${date}.csv"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Menu Template");
    ws.addRows(buildTemplateRows());
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="menu-template-${date}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("Export menu template error:", error);
    return NextResponse.json(
      { error: "导出模板失败" },
      { status: 500 },
    );
  }
}
