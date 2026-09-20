import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// MenuItem has no top-level type column — its menu type derives from its
// category. Flatten it onto the item so API consumers get `type` directly.
function withMenuType<T extends { category?: { type?: string } | null }>(item: T) {
  return { ...item, type: item.category?.type };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");

    const items = await prisma.menuItem.findMany({
      where: categoryId ? { categoryId } : undefined,
      include: { category: true },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(items.map(withMenuType));
  } catch (error: any) {
    console.error("List admin menu items error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list menu items" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      categoryId,
      name_zh,
      name_en,
      name_th,
      description_zh,
      description_en,
      description_th,
      price,
      imageUrl,
      imageThumbUrl,
      isPopular,
      isVegetarian,
      spiceLevel,
      sortOrder,
      stockType,
      dailyLimit,
      lowStockAlert,
      costPrice,
      targetMargin,
    } = body;

    if (!categoryId || !name_zh || !name_en || !name_th || price === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: categoryId, name_zh, name_en, name_th, price" },
        { status: 400 },
      );
    }

    const num = (v: any) =>
      typeof v === "number" ? v : v ? Number(v) : null;
    const type = stockType ?? "NONE";
    const cost = num(costPrice);

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name_zh,
        name_en,
        name_th,
        description_zh: description_zh || null,
        description_en: description_en || null,
        description_th: description_th || null,
        price,
        imageUrl: imageUrl || null,
        imageThumbUrl: imageThumbUrl || null,
        isPopular: isPopular || false,
        isVegetarian: isVegetarian || false,
        spiceLevel: spiceLevel || 0,
        sortOrder: sortOrder || 0,
        stockType: type,
        dailyLimit: num(dailyLimit),
        lowStockAlert: num(lowStockAlert),
        costPrice: cost,
        targetMargin:
          targetMargin === undefined || targetMargin === null || targetMargin === ""
            ? null
            : Number.isFinite(Number(targetMargin))
              ? Number(targetMargin)
              : null,
        // ⚠️ 库存两本账不在这里接受外部数值 ——
        // 只有切到「外购」时做一次初始化，之后一律由过账引擎维护。
        stockQty: type === "PURCHASED" ? 0 : null,
        stockValue: type === "PURCHASED" ? 0 : null,
        avgCost: type === "PURCHASED" ? (cost ?? 0) : null,
      },
      include: { category: true },
    });

    return NextResponse.json(withMenuType(item), { status: 201 });
  } catch (error: any) {
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create menu item" },
      { status: 500 },
    );
  }
}
