import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Fetch active ponds ordered by price
    const ponds = await prisma.pond.findMany({
      where: { isActive: true },
      orderBy: { price: "asc" },
    });

    // Fetch active spots count per pond
    const spots = await prisma.spot.findMany({
      where: { isActive: true },
      select: { pondId: true },
    });

    const spotCountMap = new Map<string, number>();
    for (const s of spots) {
      spotCountMap.set(s.pondId, (spotCountMap.get(s.pondId) || 0) + 1);
    }

    const result = ponds.map((pond) => ({
      ...pond,
      _count: { spots: spotCountMap.get(pond.id) || 0 },
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("List ponds error:", error);
    return NextResponse.json(
      { error: "Failed to list ponds" },
      { status: 500 },
    );
  }
}
