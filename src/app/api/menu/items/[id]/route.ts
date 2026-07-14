import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const item = await prisma.menuItem.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error: any) {
    console.error("Get menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get menu item" },
      { status: 500 },
    );
  }
}
