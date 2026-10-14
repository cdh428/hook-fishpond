import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import {
  FISH_PRICE_PER_KG,
  FISH_INCLUDED_KG_PER_ROD,
  countRodsFromItems,
  recalcOrderTotals,
} from "@/lib/orders";

// 鱼种价格档（2026-10-16 起，按泰文公告）
export const FISH_TIER_PRICES = {
  50: 50,
  60: 60,
  80: 80,
  100: 100,
} as const;

export type FishTier = 50 | 60 | 80 | 100;

export function isValidTier(t: unknown): t is FishTier {
  return t === 50 || t === 60 || t === 80 || t === 100;
}

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

    // 鱼种价格档（可选）
    let fishTier: FishTier | undefined;
    if (body?.fishTier != null) {
      if (!isValidTier(Number(body.fishTier))) {
        return NextResponse.json(
          { error: "fishTier must be one of 50 | 60 | 80 | 100" },
          { status: 400 },
        );
      }
      fishTier = Number(body.fishTier) as FishTier;
    }
    const tierPrice = fishTier !== undefined ? FISH_TIER_PRICES[fishTier] : undefined;

    const result = await runTx(async (tx) => {
      // 先取订单现有 items + weighings，算出本次称重后的"总鱼重 − 免扣"
      const [orderItems, priorWeighings] = await Promise.all([
        tx.orderItem.findMany({
          where: { orderId: id },
          select: { quantity: true, menuItem: { select: { name_zh: true, name_en: true, name_th: true } } },
        }),
        tx.weighing.findMany({ where: { orderId: id }, select: { weightKg: true } }),
      ]);
      const rodCount = countRodsFromItems(orderItems);
      const includedKg = rodCount * FISH_INCLUDED_KG_PER_ROD;
      const priorWeight = priorWeighings.reduce((s, w) => s + w.weightKg, 0);
      const totalAfterAdd = priorWeight + weightKg;
      // 本条称重记录的 amount = 本条重量 × 该档单价（快照）；
      // 订单级免扣（鱼竿数×1kg）在 recalcOrderTotals 里统一扣，
      // 避免逐条扣导致"前 1kg 被第一条吃光、后续每条都付费"。
      const pricePerKg = tierPrice ?? FISH_PRICE_PER_KG;
      await tx.weighing.create({
        data: {
          orderId: id,
          weightKg: Math.round(weightKg * 1000) / 1000,
          fishTier: fishTier ?? null,
          pricePerKg,
          amount: Math.round(weightKg * pricePerKg * 100) / 100,
          note: typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null,
          operator: admin.username,
        },
      });
      // 订单级免扣（鱼竿数）统一在 recalc 里算，保证口径一致
      const totals = await recalcOrderTotals(tx, id);
      void totalAfterAdd; void includedKg; // 仅用于日志/未来扩展

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
