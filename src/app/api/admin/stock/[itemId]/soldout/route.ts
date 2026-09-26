import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;
    const body = await request.json();
    const { soldOut } = body;

    if (typeof soldOut !== "boolean") {
      return NextResponse.json({ error: "soldOut must be a boolean" }, { status: 400 });
    }

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: { soldOut },
    });

    return NextResponse.json({ ok: true, soldOut: item.soldOut });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }
    console.error("Toggle sold-out error:", error);
    return NextResponse.json(
      { error: "Failed to toggle sold-out" },
      { status: 500 },
    );
  }
}
