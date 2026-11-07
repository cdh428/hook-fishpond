import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { toCsv, dateStamp } from "@/lib/menu-io";
import { buildReport, type ReportRange, type TrendGrain } from "@/lib/reports";
import { serverT, requestLocale } from "@/lib/server-t";
import { downloadErrorPage } from "@/lib/download-error";

export const dynamic = "force-dynamic";

const RANGES: ReportRange[] = ["today", "week", "month", "custom"];
const GRAINS: TrendGrain[] = ["day", "week", "month"];

type SheetKey = "summary" | "items" | "orders" | "stock";
const SHEET_KEYS: SheetKey[] = ["summary", "items", "orders", "stock"];

/** Sheet 名 → i18n key（Sheet 名必须是当前语言，不能写死中文） */
const SHEET_LABEL: Record<SheetKey, string> = {
  summary: "reportExport.sheetSummary",
  items: "reportExport.sheetItems",
  orders: "reportExport.sheetOrders",
  stock: "reportExport.sheetStock",
};

function bkkDateTime(d: Date): string {
  return new Date(d.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

function pct(rate: number | null): string {
  return rate == null ? "" : `${(rate * 100).toFixed(1)}%`;
}

type T = Awaited<ReturnType<typeof serverT>>;

/**
 * 枚举 → 人话（按当前语言）。
 *
 * 缺 key 时原样返回枚举值 —— 绝不能因为新增了一个枚举值就让整个导出 500。
 */
function enumText(t: T, group: string, value: string | null | undefined): string {
  if (!value) return "";
  try {
    return t(`enumLabel.${group}.${value}`);
  } catch {
    return value;
  }
}

/**
 * GET /api/admin/reports/export —— 导出报表（Excel / CSV）
 *
 * **语言**：`?locale=zh|en|th` 优先，其次 Referer 的 `/[locale]/` 段，
 * 最后 Accept-Language。规则见 `docs/playbooks/language-consistency.md`。
 *
 * ⚠️ 表名 / 表头 / 状态值 / 枚举列全部走 `messages/*.json`，
 * 不要再往这个文件里写中文字面量 —— en/th 页面导出的表格必须是 en/th。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locale = requestLocale({
    queryLocale: searchParams.get("locale"),
    request,
  });
  const t = await serverT(locale);

  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";

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

    const selected = (searchParams.get("content") || "summary,items")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is SheetKey => SHEET_KEYS.includes(s as SheetKey));

    const report = await buildReport(range, { from, to, grain });
    const date = dateStamp();
    const base = `report-${report.overview.period.fromDate}_${report.overview.period.toDate}-${date}`;

    // 明细表用的 UTC 区间（曼谷整日 → UTC 瞬时）
    const rangeStart = new Date(
      `${report.overview.period.fromDate}T00:00:00.000+07:00`,
    );
    const rangeEnd = new Date(
      new Date(`${report.overview.period.toDate}T00:00:00.000+07:00`).getTime() +
        24 * 60 * 60 * 1000,
    );

    // ---------- 组装各表 ----------
    const sheets = new Map<SheetKey, (string | number)[][]>();

    if (selected.includes("summary")) {
      const rows: (string | number)[][] = [
        [
          t("reportExport.colDate"),
          t("reportExport.colOrderRevenue"),
          t("reportExport.colBookingIgnored"),
          t("reportExport.colTotalRevenue"),
          t("reportExport.colOrderCount"),
          t("reportExport.colGrossProfit"),
          t("reportExport.colGrossMargin"),
        ],
      ];
      for (const row of report.trend) {
        const rev = row.revenue;
        rows.push([
          row.key,
          num(row.orderRevenue),
          num(row.bookingRevenue),
          num(rev),
          row.orders,
          num(row.profit),
          rev > 0 ? pct(row.profit / rev) : "",
        ]);
      }
      const o = report.overview;
      rows.push([
        t("reportExport.rowTotal"),
        num(o.orderRevenue),
        num(o.bookingRevenue),
        num(o.totalRevenue),
        o.orderCount + o.bookingCount,
        num(o.grossProfit),
        pct(o.marginRate),
      ]);
      rows.push([]);
      rows.push([t("reportExport.rowWasteCost"), num(o.wasteCost)]);
      rows.push([t("reportExport.rowCancelled"), o.cancelledOrders]);
      rows.push([t("reportExport.rowAvgTicket"), num(o.avgTicket)]);
      rows.push([
        t("reportExport.rowGrossNote"),
        t("reportExport.rowGrossNoteText"),
      ]);
      sheets.set("summary", rows);
    }

    if (selected.includes("items")) {
      const rows: (string | number)[][] = [
        [
          t("reportExport.colCategory"),
          t("reportExport.colNameZh"),
          t("reportExport.colNameEn"),
          t("reportExport.colNameTh"),
          t("reportExport.colPrice"),
          t("reportExport.colCost"),
          t("reportExport.colTargetMargin"),
          t("reportExport.colItemMargin"),
          t("reportExport.colSoldQty"),
          t("reportExport.colRevenue"),
          t("reportExport.colItemGross"),
          t("reportExport.colItemStatus"),
        ],
      ];
      for (const m of report.margins) {
        let status = t("reportExport.stNormal");
        if (m.costPrice == null) status = t("reportExport.stNoCost");
        else if (m.belowTarget) status = t("reportExport.stBelowTarget");
        rows.push([
          m.category,
          m.name_zh,
          m.name_en,
          m.name_th,
          num(m.price),
          m.costPrice == null ? "" : num(m.costPrice),
          pct(m.effectiveTarget),
          pct(m.marginRate),
          m.qty,
          num(m.revenue),
          m.profit == null ? "" : num(m.profit),
          status,
        ]);
      }
      sheets.set("items", rows);
    }

    if (selected.includes("orders")) {
      const orderRows = await prisma.$queryRaw<
        {
          orderNumber: string;
          createdAt: Date;
          tableCode: string | null;
          orderType: string;
          customerName: string;
          customerPhone: string;
          totalPrice: number;
          status: string;
          method: string | null;
        }[]
      >`
        SELECT o."orderNumber", o."createdAt", t."code" AS "tableCode",
               o."orderType", o."customerName", o."customerPhone",
               o."totalPrice", o."status", p."method"
        FROM "Order" o
        LEFT JOIN "DiningTable" t ON t."id" = o."tableId"
        LEFT JOIN "Payment" p ON p."orderId" = o."id"
        WHERE o."createdAt" >= ${rangeStart}
          AND o."createdAt" < ${rangeEnd}
        ORDER BY o."createdAt" DESC
      `;
      const rows: (string | number)[][] = [
        [
          t("reportExport.colOrderNo"),
          t("reportExport.colDateTime"),
          t("reportExport.colTable"),
          t("reportExport.colOrderType"),
          t("reportExport.colCustomer"),
          t("reportExport.colPhone"),
          t("reportExport.colAmount"),
          t("reportExport.colOrderStatus"),
          t("reportExport.colPayMethod"),
        ],
      ];
      for (const r of orderRows) {
        rows.push([
          r.orderNumber,
          bkkDateTime(r.createdAt),
          r.tableCode ?? "",
          enumText(t, "orderType", r.orderType),
          r.customerName,
          r.customerPhone,
          num(r.totalPrice),
          enumText(t, "orderStatus", r.status),
          enumText(t, "payMethod", r.method),
        ]);
      }
      sheets.set("orders", rows);
    }

    if (selected.includes("stock")) {
      const mvRows = await prisma.$queryRaw<
        {
          createdAt: Date;
          name: string;
          type: string;
          quantity: number;
          note: string | null;
          adminName: string | null;
        }[]
      >`
        SELECT sm."createdAt",
               CASE WHEN ${locale} = 'en' THEN mi."name_en"
                    WHEN ${locale} = 'th' THEN mi."name_th"
                    ELSE mi."name_zh" END AS "name",
               sm."type", sm."quantity", sm."note", sm."adminName"
        FROM "StockMovement" sm
        JOIN "MenuItem" mi ON mi."id" = sm."itemId"
        WHERE sm."voidedAt" IS NULL
          AND sm."createdAt" >= ${rangeStart}
          AND sm."createdAt" < ${rangeEnd}
        ORDER BY sm."createdAt" DESC
      `;
      const rows: (string | number)[][] = [
        [
          t("reportExport.colTime"),
          t("reportExport.colItem"),
          t("reportExport.colType"),
          t("reportExport.colQty"),
          t("reportExport.colNote"),
          t("reportExport.colOperator"),
        ],
      ];
      for (const r of mvRows) {
        rows.push([
          bkkDateTime(r.createdAt),
          r.name,
          enumText(t, "stockMoveType", r.type),
          r.quantity,
          r.note ?? "",
          r.adminName ?? "",
        ]);
      }
      sheets.set("stock", rows);
    }

    if (sheets.size === 0) {
      return NextResponse.json({ error: "No content selected" }, { status: 400 });
    }

    // ---------- CSV：单表 ----------
    if (format === "csv") {
      const sheetParam = (searchParams.get("sheet") || "") as SheetKey;
      const key: SheetKey =
        sheetParam && sheets.has(sheetParam)
          ? sheetParam
          : sheets.has("items")
            ? "items"
            : ([...sheets.keys()][0] as SheetKey);
      const csv = toCsv(sheets.get(key)!);
      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}-${key}.csv"`,
        },
      });
    }

    // ---------- XLSX：多表 ----------
    const wb = new ExcelJS.Workbook();
    for (const [key, rows] of sheets) {
      const ws = wb.addWorksheet(t(SHEET_LABEL[key] as any));
      ws.addRows(rows);
      ws.getRow(1).font = { bold: true };
    }
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("Report export error:", error);
    // 这是浏览器下载导航，返回 JSON 会让用户看到 {"error":"..."} 原文页
    return downloadErrorPage(t("apiErr.exportFailed"), {
      title: t("apiErr.exportFailed"),
      back: t("adminReports.entry"),
    });
  }
}

/** 金额保留两位小数，避免浮点噪声写进表格 */
function num(v: number): number {
  return Math.round(v * 100) / 100;
}
