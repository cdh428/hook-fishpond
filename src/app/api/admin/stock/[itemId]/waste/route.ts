import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { applyStockChange } from "@/lib/stock";

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
    const { quantity, note } = body;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "损耗数量必须为正整数" },
        { status: 400 },
      );
    }

    const result = await applyStockChange({
      itemId,
      type: "WASTE",
      quantity: -Math.abs(quantity),
      note: note || undefined,
      adminName: admin.username,
    });

    return NextResponse.json({ ok: true, stockQty: result.stockQty });
  } catch (error: any) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }
    console.error("Waste stock error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to record waste" },
      { status: 500 },
    );
  }
}
