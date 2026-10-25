import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Neon 远端，放宽执行上限
export const maxDuration = 60;

/**
 * POST /api/admin/orders/[id]/auto-print —— 出单状态回写
 *
 * body:
 *   state?: "PRINTED" | "FAILED"   默认 PRINTED
 *   error?: string                  FAILED 时记一句原因（如「打印桥不可用」）
 *
 * 这是「同一张单只自动出一次纸」的**服务端持久化凭证**：
 * 收银台打完立刻置 PRINTED，之后刷新页面 / 换台收银机 / 加菜，都不会重复出纸，
 * 页面只会显示「已打印 时间」+ 新单提示。
 *
 * 打不出来时置 FAILED：不再自动重试（避免每小时把 14 张旧单重打一遍），
 * 改为在订单卡片上挂「未打印」角标，等店员手动补打 —— 人工介入才是安全兜底。
 *
 * 幂等：重复调用无副作用；PRINTED 不会被 FAILED 覆盖（打成功过就是打成功过）。
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
    const body = await request.json().catch(() => ({}));
    const state = body?.state === "FAILED" ? "FAILED" : "PRINTED";
    const error = body?.error ? String(body.error).slice(0, 300) : null;

    const existing = await prisma.order.findUnique({
      where: { id },
      select: { printState: true, printedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 已出过票的单，失败回写不该把状态降级（可能是补打时桥又断了）
    if (existing.printState === "PRINTED" && state === "FAILED") {
      return NextResponse.json({
        id,
        printState: "PRINTED",
        printedAt: existing.printedAt,
      });
    }

    const now = new Date();
    const order = await prisma.order.update({
      where: { id },
      data:
        state === "PRINTED"
          ? {
              printState: "PRINTED",
              printedAt: now,
              printError: null,
              autoPrintFired: true, // 历史字段保持同步，老代码/报表仍可读
            }
          : { printState: "FAILED", printError: error },
      select: { id: true, printState: true, printedAt: true, printError: true },
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
