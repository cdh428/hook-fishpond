import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyStockChange } from "@/lib/stock";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

/** 损耗 / 自用：数量传正数，按出库处理。 */
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

    return NextResponse.json({
      ok: true,
      stockQty: result.stockQty,
      stockValue: result.stockValue,
      avgCost: result.avgCost,
    });
  } catch (error) {
    return ledgerErrorResponse(error, "Waste stock error");
  }
}
