import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const popular = searchParams.get("popular");

    if (popular === "true") {
      const items = await prisma.menuItem.findMany({
        where: { isPopular: true, isActive: true },
        include: { category: true },
        orderBy: { sortOrder: "asc" },
      });
      return NextResponse.json(items);
    }

    if (!categoryId) {
      // Return all active items
      const items = await prisma.menuItem.findMany({
        where: { isActive: true },
        include: { category: true },
        orderBy: { sortOrder: "asc" },
      });
      return NextResponse.json(items);
    }

    const items = await prisma.menuItem.findMany({
      where: { categoryId, isActive: true },
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
