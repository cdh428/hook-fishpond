import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const popular = searchParams.get("popular");

    if (popular === "true") {
      const items = await prisma.menuItem.findMany({
        where: {
          isPopular: true,
          isActive: true,
        },
        include: { category: true },
        orderBy: { sortOrder: "asc" },
      });

      return NextResponse.json(items);
    }

    const items = await prisma.menuItem.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(items);
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

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create menu item" },
      { status: 500 },
    );
  }
}
