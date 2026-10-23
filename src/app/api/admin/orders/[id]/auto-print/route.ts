import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Neon 远端，放宽执行上限
export const maxDuration = 60;

/**
 * POST /api/admin/orders/[id]/auto-print
 *
 * 收银台「自动出单」打完一张新订单的客户票+后厨票+播报后，立刻调本路由把
 * `Order.autoPrintFired` 置 true —— 这是「同一张单只自动打一次」的服务端持久化
 * 凭证：之后该单再加菜/改菜，自动出票器都不再触发，只能手动按打印键。
 *
 * 用服务端标记而非浏览器 sessionStorage：标签页关了 / 换台收银机 / 刷新，
 * 都不会把同一张新单重复出纸。
 *
 * 幂等：已置过再调也无副作用（永远 true）。
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
    const order = await prisma.order.update({
      where: { id },
      data: { autoPrintFired: true },
      select: { id: true, autoPrintFired: true },
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Auto-print mark error:", error);
    return NextResponse.json(
      { error: "Failed to mark order as auto-printed" },
      { status: 500 },
    );
  }
}
