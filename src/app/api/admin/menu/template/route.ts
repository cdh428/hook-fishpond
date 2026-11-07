import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { buildTemplateRows, toCsv, dateStamp } from "@/lib/menu-io";
import { serverT, requestLocale } from "@/lib/server-t";
import { downloadErrorPage } from "@/lib/download-error";

/**
 * GET /api/admin/menu/template —— 下载空白导入模板（Excel / CSV）
 *
 * **语言**：`?locale=` 优先，其次 Referer。表头与示例行都按该语言输出，
 * 且导入端认三语表头 —— 用哪种语言下载的模板都能导回去。
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
    const date = dateStamp();

    if (format === "csv") {
      const csv = toCsv(buildTemplateRows(ctx));
      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="menu-template-${date}.csv"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t("adminBulk.downloadTemplate"));
    ws.addRows(buildTemplateRows(ctx));
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
    return downloadErrorPage(t("apiErr.templateFailed"), {
      title: t("apiErr.templateFailed"),
      back: t("adminBulk.backToMenu"),
    });
  }
}
