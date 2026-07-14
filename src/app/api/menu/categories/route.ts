import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // FOOD or DRINK

    const categories = await prisma.menuCategory.findMany({
      where: {
        isActive: true,
        ...(type && { type: type as "FOOD" | "DRINK" }),
      },
      include: {
        _count: { select: { items: { where: { isActive: true } } } },
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
