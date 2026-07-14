import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const categories = await prisma.menuCategory.findMany({
      where: {
        ...(type && { type: type as "FOOD" | "DRINK" }),
      },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error: any) {
    console.error("List categories error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list categories" },
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

    const category = await prisma.menuCategory.create({
      data: {
        name_zh,
        name_en,
        name_th,
        type: type as "FOOD" | "DRINK",
        imageUrl: imageUrl || null,
        sortOrder: sortOrder || 0,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    console.error("Create category error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create category" },
      { status: 500 },
    );
  }
}
