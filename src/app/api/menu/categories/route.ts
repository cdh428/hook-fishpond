import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const categories = await prisma.menuCategory.findMany({
      where: {
        isActive: true,
        ...(type ? { type: type as "FOOD" | "DRINK" } : {}),
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
