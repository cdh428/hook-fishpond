import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { runTx } from "@/lib/tx";
import { buildStockViews } from "@/lib/stock";
import { reverseMovement, ledgerErrorResponse } from "@/lib/stock-ledger";

const VALID_STOCK_TYPES = ["NONE", "MADE", "PURCHASED"];

function toItemShape(it: any, v: any) {
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
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;

    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    const views = await buildStockViews([item]);
    const v = views.get(item.id);

    const movementRows = await prisma.stockMovement.findMany({
      where: { itemId },
      orderBy: { createdAt: "desc" },
      take: 80,
    });

    // 已冲销的分录 id（用于在列表上打「已冲销」标记）
    const reversedIds = new Set(
      (
        await prisma.stockMovement.findMany({
          where: { itemId, reversalOf: { not: null } },
          select: { reversalOf: true },
        })
      ).map((m) => m.reversalOf as string),
    );

    const movements = movementRows.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      unitCost: m.unitCost,
      amount: m.amount,
      balanceAfter: m.balanceAfter,
      docType: m.docType,
      docId: m.docId,
      reversalOf: m.reversalOf,
      reversed: reversedIds.has(m.id),
      note: m.note,
      orderId: m.orderId,
      adminName: m.adminName,
      createdAt: m.createdAt,
    }));

    // 数量账 / 金额账 / 分录汇总（对账口径）
    const agg = await prisma.stockMovement.aggregate({
      where: { itemId },
      _sum: { quantity: true, amount: true },
      _count: { _all: true },
    });
    const ledgerQty = agg._sum.quantity ?? 0;
    const ledgerValue = Math.round((agg._sum.amount ?? 0) * 100) / 100;
    const bookQty = item.stockQty ?? 0;
    const bookValue = Math.round((item.stockValue ?? 0) * 100) / 100;

    return NextResponse.json({
      item: toItemShape(item, v),
      movements,
      ledger: {
        entryCount: agg._count._all ?? 0,
        qty: ledgerQty,
        value: ledgerValue,
        bookQty,
        bookValue,
        qtyDiff: bookQty - ledgerQty,
        valueDiff: Math.round((bookValue - ledgerValue) * 100) / 100,
        ok: bookQty === ledgerQty && Math.abs(bookValue - ledgerValue) < 0.01,
      },
    });
  } catch (error) {
    return ledgerErrorResponse(error, "Get stock item error");
  }
}

/** 库存设置（类型 / 限量 / 预警线 / 参考成本 / 强制售罄）—— 均不直接改余额 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;
    const body = await request.json();
    const updateData: Record<string, any> = {};

    if (body.stockType !== undefined) {
      if (!VALID_STOCK_TYPES.includes(body.stockType)) {
        return NextResponse.json({ error: "Invalid stockType" }, { status: 400 });
      }
      updateData.stockType = body.stockType;
    }

    if (body.dailyLimit !== undefined) {
      if (
        body.dailyLimit !== null &&
        (!Number.isInteger(body.dailyLimit) || body.dailyLimit < 0)
      ) {
        return NextResponse.json(
          { error: "dailyLimit must be a non-negative integer or null" },
          { status: 400 },
        );
      }
      updateData.dailyLimit = body.dailyLimit;
    }

    if (body.lowStockAlert !== undefined) {
      if (
        body.lowStockAlert !== null &&
        (!Number.isInteger(body.lowStockAlert) || body.lowStockAlert < 0)
      ) {
        return NextResponse.json(
          { error: "lowStockAlert must be a non-negative integer or null" },
          { status: 400 },
        );
      }
      updateData.lowStockAlert = body.lowStockAlert;
    }

    if (body.costPrice !== undefined) {
      if (
        body.costPrice !== null &&
        (typeof body.costPrice !== "number" ||
          Number.isNaN(body.costPrice) ||
          body.costPrice < 0)
      ) {
        return NextResponse.json(
          { error: "costPrice must be a non-negative number or null" },
          { status: 400 },
        );
      }
      updateData.costPrice = body.costPrice;
    }

    if (body.soldOut !== undefined) {
      if (typeof body.soldOut !== "boolean") {
        return NextResponse.json({ error: "soldOut must be a boolean" }, { status: 400 });
      }
      updateData.soldOut = body.soldOut;
    }

    // ⚠️ 这里**不接受** stockQty / stockValue —— 库存余额只能由过账引擎维护。
    // 首次切换为外购时把两本账初始化为 0（NULL 会让展示与扣减口径不一致）。
    if (updateData.stockType === "PURCHASED") {
      const cur = await prisma.menuItem.findUnique({
        where: { id: itemId },
        select: { stockQty: true, stockValue: true, avgCost: true, costPrice: true },
      });
      if (!cur) {
        return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
      }
      if (cur.stockQty === null) updateData.stockQty = 0;
      if (cur.stockValue === null) updateData.stockValue = 0;
      if (cur.avgCost === null) updateData.avgCost = cur.costPrice ?? 0;
    }

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: updateData,
      include: { category: true },
    });

    const views = await buildStockViews([item]);
    const v = views.get(item.id);

    return NextResponse.json({ item: toItemShape(item, v) });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }
    return ledgerErrorResponse(error, "Patch stock item error");
  }
}

/**
 * 红字冲销某条手工分录（调整 / 损耗 / 期初）。
 * 历史分录永不修改，只追加一条反向分录。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "reverse" || !body?.movementId) {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const result = await runTx(async (tx) => {
      const origin = await tx.stockMovement.findUnique({
        where: { id: String(body.movementId) },
        select: { itemId: true },
      });
      if (!origin || origin.itemId !== itemId) {
        throw new Error("NOT_FOUND");
      }
      return reverseMovement(tx, String(body.movementId), {
        adminName: admin.username,
        note: body.note ?? null,
      });
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return ledgerErrorResponse(error, "Reverse movement error");
  }
}
