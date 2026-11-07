import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildExportRows, toCsv, dateStamp } from "@/lib/menu-io";
import { serverT, requestLocale } from "@/lib/server-t";
import { downloadErrorPage } from "@/lib/download-error";

/**
 * GET /api/admin/menu/export —— 导出当前菜单（Excel / CSV）
 *
 * **语言**：`?locale=` 优先，其次 Referer 的 `/[locale]/` 段。
 * 表头与「是/否」「自制/外购」等单元格值都按该语言输出。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locale = requestLocale({
    queryLocale: searchParams.get("locale"),
    request,
  });
  const t = await serverT(locale);
  const ctx = { locale, t };

  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";

    const items = await prisma.menuItem.findMany({
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });

    const date = dateStamp();

    if (format === "csv") {
      const csv = toCsv(buildExportRows(items as any, ctx));
      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="menu-${date}.csv"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t("adminBulk.exportCurrent"));
    const rows = buildExportRows(items as any, ctx);
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
    return downloadErrorPage(t("apiErr.exportFailed"), {
      title: t("apiErr.exportFailed"),
      back: t("adminBulk.backToMenu"),
    });
  }
}
