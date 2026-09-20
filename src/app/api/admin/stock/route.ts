import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildStockViews } from "@/lib/stock";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.menuItem.findMany({
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });

    const views = await buildStockViews(items);

    const list = items.map((it) => {
      const v = views.get(it.id);
      return {
        id: it.id,
        name_zh: it.name_zh,
        name_en: it.name_en,
        name_th: it.name_th,
        categoryName: it.category.name_zh,
        price: it.price,
        costPrice: it.costPrice,
        imageThumbUrl: it.imageThumbUrl,
        stockType: it.stockType,
        dailyLimit: it.dailyLimit,
        stockQty: it.stockQty,
        stockValue: it.stockValue,
        avgCost: it.avgCost,
        lowStockAlert: it.lowStockAlert,
        soldOut: it.soldOut,
        view: v,
      };
    });

    let soldOut = 0;
    let lowStock = 0;
    let stockValueTotal = 0;
    for (const it of list) {
      if (it.view?.soldOut) soldOut++;
      if (it.view?.lowStock) lowStock++;
      if (it.stockType === "PURCHASED") {
        stockValueTotal += it.stockValue ?? 0;
      }
    }
    stockValueTotal = Math.round(stockValueTotal * 100) / 100;
    const total = list.length;
    const normal = total - soldOut - lowStock;

    return NextResponse.json({
      items: list,
      summary: { soldOut, lowStock, normal, total, stockValueTotal },
    });
  } catch (error) {
    return ledgerErrorResponse(error, "Stock overview error");
  }
}
