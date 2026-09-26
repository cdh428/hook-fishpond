import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isMenuType, MENU_TYPES } from "@/lib/menu-types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const where: any = {};
    if (type && isMenuType(type)) where.type = type;

    const categories = await prisma.menuCategory.findMany({
      where,
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error: any) {
    console.error("List categories error:", error);
    return NextResponse.json(
      { error: "Failed to list categories" },
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
    const { name_zh, name_en, name_th, type, imageUrl, sortOrder } = body;

    if (!name_zh || !name_en || !name_th || !type) {
      return NextResponse.json(
        { error: "Missing required fields: name_zh, name_en, name_th, type" },
        { status: 400 },
      );
    }

    if (!isMenuType(type)) {
      return NextResponse.json(
        { error: `Invalid type: ${type}. Expected one of ${MENU_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const category = await prisma.menuCategory.create({
      data: {
        name_zh,
        name_en,
        name_th,
        type,
        imageUrl: imageUrl || null,
        sortOrder: sortOrder || 0,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    console.error("Create category error:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }
}
