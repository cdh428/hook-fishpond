import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const ponds = await prisma.pond.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { spots: { where: { isActive: true } } },
        },
      },
      orderBy: { price: "asc" },
    });

    return NextResponse.json(ponds);
  } catch (error: any) {
    console.error("List ponds error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list ponds" },
      { status: 500 },
    );
  }
}
