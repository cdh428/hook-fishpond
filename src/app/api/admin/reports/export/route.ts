import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { toCsv, dateStamp } from "@/lib/menu-io";
import { buildReport, type ReportRange, type TrendGrain } from "@/lib/reports";

export const dynamic = "force-dynamic";

const RANGES: ReportRange[] = ["today", "week", "month", "custom"];
const GRAINS: TrendGrain[] = ["day", "week", "month"];

type SheetKey = "summary" | "items" | "orders" | "stock";

const SHEET_NAMES: Record<SheetKey, string> = {
  summary: "营收汇总",
  items: "菜品明细",
  orders: "订单明细",
  stock: "库存流水",
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

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
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
      .filter((s): s is SheetKey => s in SHEET_NAMES);

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
        ["日期", "点餐营收", "预约营收", "总营收", "订单数", "毛利", "毛利率"],
      ];
      for (const t of report.trend) {
        const rev = t.revenue;
        rows.push([
          t.key,
          num(t.orderRevenue),
          num(t.bookingRevenue),
          num(rev),
          t.orders,
          num(t.profit),
          rev > 0 ? pct(t.profit / rev) : "",
        ]);
      }
      const o = report.overview;
      rows.push([
        "合计",
        num(o.orderRevenue),
        num(o.bookingRevenue),
        num(o.totalRevenue),
        o.orderCount + o.bookingCount,
        num(o.grossProfit),
        pct(o.marginRate),
      ]);
      rows.push([]);
      rows.push(["损耗成本", num(o.wasteCost)]);
      rows.push(["取消订单", o.cancelledOrders]);
      rows.push(["客单价（点餐）", num(o.avgTicket)]);
      rows.push([
        "毛利口径说明",
        "毛利仅统计已填成本价的菜品；改成本价会影响历史报表",
      ]);
      sheets.set("summary", rows);
    }

    if (selected.includes("items")) {
      const rows: (string | number)[][] = [
        [
          "分类",
          "菜品(中)",
          "菜品(英)",
          "菜品(泰)",
          "售价",
          "成本价",
          "目标毛利率",
          "单品毛利率",
          "期间销量",
          "期间营收",
          "期间毛利",
          "状态",
        ],
      ];
      for (const m of report.margins) {
        let status = "正常";
        if (m.costPrice == null) status = "未设成本";
        else if (m.belowTarget) status = "低于目标";
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
        ["订单号", "时间(曼谷)", "桌号", "用餐方式", "客户", "电话", "金额", "状态", "支付方式"],
      ];
      for (const r of orderRows) {
        rows.push([
          r.orderNumber,
          bkkDateTime(r.createdAt),
          r.tableCode ?? "",
          r.orderType,
          r.customerName,
          r.customerPhone,
          num(r.totalPrice),
          r.status,
          r.method ?? "",
        ]);
      }
      sheets.set("orders", rows);
    }

    if (selected.includes("stock")) {
      const mvRows = await prisma.$queryRaw<
        {
          createdAt: Date;
          name_zh: string;
          type: string;
          quantity: number;
          note: string | null;
          adminName: string | null;
        }[]
      >`
        SELECT sm."createdAt", mi."name_zh", sm."type", sm."quantity", sm."note", sm."adminName"
        FROM "StockMovement" sm
        JOIN "MenuItem" mi ON mi."id" = sm."itemId"
        WHERE sm."voidedAt" IS NULL
          AND sm."createdAt" >= ${rangeStart}
          AND sm."createdAt" < ${rangeEnd}
        ORDER BY sm."createdAt" DESC
      `;
      const rows: (string | number)[][] = [
        ["时间(曼谷)", "菜品", "类型", "数量", "备注", "操作人"],
      ];
      for (const r of mvRows) {
        rows.push([
          bkkDateTime(r.createdAt),
          r.name_zh,
          r.type,
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
      const ws = wb.addWorksheet(SHEET_NAMES[key]);
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
    return NextResponse.json(
      { error: error.message || "Export failed" },
      { status: 500 },
    );
  }
}

/** 金额保留两位小数，避免浮点噪声写进表格 */
function num(v: number): number {
  return Math.round(v * 100) / 100;
}
