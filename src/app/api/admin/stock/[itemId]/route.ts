import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildStockViews } from "@/lib/stock";

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
      take: 50,
    });

    const movements = movementRows.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      note: m.note,
      orderId: m.orderId,
      adminName: m.adminName,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({ item: toItemShape(item, v), movements });
  } catch (error: any) {
    console.error("Get stock item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load stock item" },
      { status: 500 },
    );
  }
}

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
    console.error("Patch stock item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update stock item" },
      { status: 500 },
    );
  }
}
