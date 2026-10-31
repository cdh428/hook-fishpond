import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Neon(us-east-2) ← 泰国：往返延迟较高，放宽函数执行上限
export const maxDuration = 60;

const ORDER_INCLUDE = {
  items: {
    include: {
      menuItem: { select: { name_zh: true, name_en: true, name_th: true, price: true } },
    },
  },
  weighings: { orderBy: { createdAt: "asc" as const } },
  payment: true,
  bookings: { include: { pond: true } },
  table: true,
};

/**
 * POST /api/admin/orders/[id]/serve-items —— 行级送餐确认 / 取消送餐
 *
 * body:
 *   itemIds: string[]    要标记的菜品行 id（必须是本订单的行）
 *   served:  boolean      true=标记已送（servedAt=now）；false=取消送餐（清空 servedAt，送错了撤销）
 *
 * 交互（用户已确认）：
 *  - 送餐时勾选「还没送出」的菜品行 → 标 servedAt=now
 *  - 送错了可在弹窗里勾选「已送」行 → 清空 servedAt（取消标记）
 *  - 订单状态**不**自动推 SERVED（由店员手动推），本接口只标记行级送餐时间
 *
 * 返回：更新后的订单（含菜品行 servedAt），前端可就地刷新。
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
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.map(String) : [];
    const served = Boolean(body?.served);

    if (itemIds.length === 0) {
      return NextResponse.json({ error: "itemIds[] is required" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status === "CANCELLED" || order.status === "SETTLED") {
      return NextResponse.json({ error: "Order is closed" }, { status: 400 });
    }

    // 只允许标记属于本订单的行，防止越权改别的单
    const rows = await prisma.orderItem.findMany({
      where: { id: { in: itemIds }, orderId: id },
      select: { id: true },
    });
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No matching order items for this order" },
        { status: 400 },
      );
    }
    const validIds = rows.map((r) => r.id);

    await prisma.orderItem.updateMany({
      where: { id: { in: validIds }, orderId: id },
      data: served ? { servedAt: new Date() } : { servedAt: null },
    });

    const updated = await prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Serve items error:", error);
    return NextResponse.json(
      { error: "Failed to mark served" },
      { status: 500 },
    );
  }
}
