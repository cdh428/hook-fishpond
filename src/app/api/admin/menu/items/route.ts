import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

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

    return NextResponse.json(items);
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
    } = body;

    if (!categoryId || !name_zh || !name_en || !name_th || price === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: categoryId, name_zh, name_en, name_th, price" },
        { status: 400 },
      );
    }

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
      },
      include: { category: true },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create menu item" },
      { status: 500 },
    );
  }
}
