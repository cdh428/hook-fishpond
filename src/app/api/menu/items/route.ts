import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildStockViews, LOW_STOCK_DISPLAY_THRESHOLD } from "@/lib/stock";
import { optionGroupsInclude, toPublicGroups } from "@/lib/menu-options-server";

// MenuItem has no top-level type column — its menu type derives from its
// category. Flatten it onto the item so API consumers get `type` directly.
function withMenuType<T extends { category?: { type?: string } | null }>(item: T) {
  return { ...item, type: item.category?.type };
}

async function withStockField(items: any[]) {
  // Never expose the exact remaining count above the display threshold.
  const views = await buildStockViews(items);
  return items.map((it) => {
    const v = views.get(it.id)!;
    return {
      ...withMenuType(it),
      // 选项组：顾客端据此弹规格面板；无选项的菜品为一空数组
      optionGroups: toPublicGroups(it.optionGroups),
      stock: {
        soldOut: v.soldOut,
        remaining:
          v.remaining != null && v.remaining <= LOW_STOCK_DISPLAY_THRESHOLD
            ? v.remaining
            : null,
        stockType: v.stockType,
      },
    };
  });
}

const PUBLIC_INCLUDE = {
  category: true,
  optionGroups: optionGroupsInclude,
};

/**
 * 公开菜单的可售条件：**商品本身启用 且 所属分类也启用**。
 *
 * 后台删除一个「下面还有商品」的分类时走的是软删（只把分类置为停用），
 * 分类 chip 因此不再渲染。如果这里只看商品自己的 isActive，那些商品就会
 * 掉进「分类入口没了、商品却还在」的半隐藏状态——列表里看不到、搜索却能
 * 搜到，后台也无从察觉。两处口径必须一致。
 *
 * 注意：后台接口（/api/admin/menu/items）不过滤分类状态，管理员始终看得见。
 */
const PUBLIC_ITEM_WHERE = {
  isActive: true,
  category: { isActive: true },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const popular = searchParams.get("popular");

    if (popular === "true") {
      const items = await prisma.menuItem.findMany({
        where: {
          ...PUBLIC_ITEM_WHERE,
          isPopular: true,
        },
        include: PUBLIC_INCLUDE,
        orderBy: { sortOrder: "asc" },
      });

      return NextResponse.json(await withStockField(items));
    }

    const items = await prisma.menuItem.findMany({
      where: {
        ...PUBLIC_ITEM_WHERE,
        ...(categoryId ? { categoryId } : {}),
      },
      include: PUBLIC_INCLUDE,
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(await withStockField(items));
  } catch (error: any) {
    console.error("List menu items error:", error);
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
      price,
      spiceLevel,
      isPopular,
      isVegetarian,
      description_zh,
      description_en,
      description_th,
      imageUrl,
    } = body;

    if (!categoryId || !name_zh || !name_en || !name_th || price == null) {
      return NextResponse.json(
        { error: "Missing required fields: categoryId, name_*, price" },
        { status: 400 },
      );
    }

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name_zh,
        name_en,
        name_th,
        price: Number(price),
        spiceLevel: spiceLevel ?? 0,
        isPopular: !!isPopular,
        isVegetarian: !!isVegetarian,
        description_zh: description_zh ?? null,
        description_en: description_en ?? null,
        description_th: description_th ?? null,
        imageUrl: imageUrl ?? null,
        isActive: true,
        sortOrder: 0,
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
