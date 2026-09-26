import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import { FISH_PRICE_PER_KG, recalcOrderTotals } from "@/lib/orders";

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
  table: true,
};

/** POST /api/admin/orders/[id]/weigh —— 录入一次渔获称重（默认前 1kg 免费，超出 60฿/kg） */
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
    const weightKg = Number(body?.weightKg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      return NextResponse.json({ error: "weightKg must be > 0" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status === "CANCELLED") {
      return NextResponse.json({ error: "Order is cancelled" }, { status: 400 });
    }

    const result = await runTx(async (tx) => {
      await tx.weighing.create({
        data: {
          orderId: id,
          weightKg: Math.round(weightKg * 1000) / 1000,
          pricePerKg: FISH_PRICE_PER_KG,
          amount: Math.round(weightKg * FISH_PRICE_PER_KG * 100) / 100,
          note: typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null,
          operator: admin.username,
        },
      });
      const totals = await recalcOrderTotals(tx, id);

      await tx.payment.updateMany({
        where: { orderId: id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
        data: { amount: totals.totalPrice },
      });

      return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Add weighing error:", error);
    return NextResponse.json(
      { error: "Failed to add weighing" },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/orders/[id]/weigh?weighingId=xxx —— 撤销一次称重 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const weighingId = new URL(request.url).searchParams.get("weighingId");
    if (!weighingId) {
      return NextResponse.json({ error: "weighingId is required" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const result = await runTx(async (tx) => {
      await tx.weighing.deleteMany({ where: { id: weighingId, orderId: id } });
      const totals = await recalcOrderTotals(tx, id);

      await tx.payment.updateMany({
        where: { orderId: id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
        data: { amount: totals.totalPrice },
      });

      return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Delete weighing error:", error);
    return NextResponse.json(
      { error: "Failed to delete weighing" },
      { status: 500 },
    );
  }
}
