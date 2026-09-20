import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyStockChange } from "@/lib/stock";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

/** 手工调整：带符号增量（正=增加，负=减少）。不允许把库存扣成负数。 */
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

    if (!Number.isInteger(quantity) || quantity === 0) {
      return NextResponse.json(
        { error: "调整数量必须为非零整数" },
        { status: 400 },
      );
    }

    const result = await applyStockChange({
      itemId,
      type: "MANUAL",
      quantity,
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
    return ledgerErrorResponse(error, "Adjust stock error");
  }
}
