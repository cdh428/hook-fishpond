import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { repairOrderStock } from "@/lib/stock-watch";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

export const maxDuration = 60;

/**
 * POST /api/admin/orders/[id]/stock-repair
 *
 * 补记一张「卖了没扣」的订单：拿台账差额对照订单数量，把漏掉的出库分录补上。
 *
 * 典型场景：下单时该菜品还没启用库存管理（NONE），后来改成「外购」，
 * 于是下单没预占、结账时也没扣 —— 库存永远不会减。这个接口把它修回来。
 *
 * 幂等：台账上已经出库的数量会被扣除，重复调用不会重复扣。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await repairOrderStock(id, { adminName: admin.username });

    return NextResponse.json({
      ok: true,
      orderId: id,
      consumed: result.consumed,
      healed: result.healed,
      message:
        result.healed > 0
          ? `已补记 ${result.healed} 件漏扣库存`
          : "台账已平整，无需补记",
    });
  } catch (error) {
    return ledgerErrorResponse(error, "Repair order stock error");
  }
}
