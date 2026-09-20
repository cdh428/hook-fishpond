import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reconcileStock, recalcStock } from "@/lib/stock-docs";
import { auditOrderStockLink } from "@/lib/stock-watch";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

/**
 * 账实核对。
 *
 *  - `items` / `summary`：逐品对比「账面余额」与「分录汇总」（库存 → 台账）
 *  - `orderLink`：订单 → 库存 的挂钩体检，回答「有没有卖了没扣的单」
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [result, orderLink] = await Promise.all([
      reconcileStock(),
      auditOrderStockLink(),
    ]);
    return NextResponse.json({ ...result, orderLink });
  } catch (error) {
    return ledgerErrorResponse(error, "Reconcile stock error");
  }
}

/**
 * 按台账重算余额。
 * 传 itemIds 只重算指定菜品；不传则全量扫描（只改真正不符的）。
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const result = await recalcStock({
      itemIds: Array.isArray(body?.itemIds) ? body.itemIds : undefined,
      adminName: admin.username,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return ledgerErrorResponse(error, "Recalc stock error");
  }
}
