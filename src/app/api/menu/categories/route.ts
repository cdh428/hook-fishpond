import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MENU_TYPES, type MenuTypeValue } from "@/lib/menu-types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    // 只接受已知大类，未知值直接忽略过滤条件，避免抛 Prisma 枚举错误
    const typeFilter =
      type && (MENU_TYPES as readonly string[]).includes(type)
        ? { type: type as MenuTypeValue }
        : {};

    const categories = await prisma.menuCategory.findMany({
      where: {
        isActive: true,
        ...typeFilter,
      },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(categories);
  } catch (error: any) {
    console.error("List menu categories error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list menu categories" },
      { status: 500 },
    );
  }
}
