import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createPurchaseReceipt } from "@/lib/stock-docs";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

/**
 * 单品快捷入库。
 * 语义上是「开一张只含这一行的进货单」—— 所以每次入库都会留下单据号与分录，
 * 可在「进货单」页查看/冲销。
 */
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
    const { quantity, unitCost, note } = body;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "入库数量必须为正整数" }, { status: 400 });
    }

    const result = await createPurchaseReceipt({
      lines: [{ menuItemId: itemId, qty: quantity, unitCost }],
      note: note || null,
      adminName: admin.username,
    });

    const snap = result.stock[0];
    return NextResponse.json({
      ok: true,
      receiptId: result.id,
      receiptCode: result.code,
      stockQty: snap?.stockQty ?? null,
      stockValue: snap?.stockValue ?? null,
      avgCost: snap?.avgCost ?? null,
    });
  } catch (error) {
    return ledgerErrorResponse(error, "Purchase stock error");
  }
}
