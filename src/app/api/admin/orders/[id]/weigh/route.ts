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

// 鱼种价格档（2026-10-16 起，按泰文公告；0=免重档，不计费）
export const FISH_TIER_PRICES = {
  0: 0,
  50: 50,
  60: 60,
  80: 80,
  100: 100,
} as const;

export type FishTier = 0 | 50 | 60 | 80 | 100;

export function isValidTier(t: unknown): t is FishTier {
  return t === 0 || t === 50 || t === 60 || t === 80 || t === 100;
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

    // 档位（0=免重、50/60/80/100=收费档；不传则按历史兜底 60）
    let fishTier: FishTier | null;
    if (body?.fishTier != null) {
      const tier = Number(body.fishTier);
      if (!isValidTier(tier)) {
        return NextResponse.json(
          { error: "fishTier must be one of 0 | 50 | 60 | 80 | 100" },
          { status: 400 },
        );
      }
      fishTier = tier;
    } else {
      fishTier = null;
    }
    // 免重档（0）单价为 0（只记录重量、不计费）；收费档按档价；缺省按兜底 60
    const pricePerKg = fishTier === 0 ? 0 : fishTier != null ? FISH_TIER_PRICES[fishTier] : FISH_PRICE_PER_KG;

    // 免重校验：免重行的累计重量不能超过鱼竿数×1kg
    if (fishTier === 0) {
      const items = await prisma.orderItem.findMany({
        where: { orderId: id },
        select: { quantity: true, menuItem: { select: { name_zh: true, name_en: true, name_th: true } } },
      });
      const rodCount = countRodsFromItems(items);
      const totalIncludedKg = rodCount * FISH_INCLUDED_KG_PER_ROD;
      const priorFree = (await prisma.weighing.findMany({
        where: { orderId: id, fishTier: 0 },
        select: { weightKg: true },
      })).reduce((s, w) => s + w.weightKg, 0);
      if (priorFree + weightKg > totalIncludedKg + 1e-9) {
        return NextResponse.json(
          {
            error: "FREE_TIER_EXCEEDED",
            freeKg: totalIncludedKg,
            priorFreeKg: priorFree,
            msg: `免重超出：本桌免重共 ${totalIncludedKg}kg，已填 ${priorFree}kg，本条 ${weightKg}kg 超出`,
          },
          { status: 400 },
        );
      }
    }

    const result = await runTx(async (tx) => {
      const priorWeighings = await tx.weighing.findMany({ where: { orderId: id }, select: { weightKg: true } });
      void priorWeighings;
      await tx.weighing.create({
        data: {
          orderId: id,
          weightKg: Math.round(weightKg * 1000) / 1000,
          fishTier,
          pricePerKg,
          amount: Math.round(weightKg * pricePerKg * 100) / 100,
          note: typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null,
          operator: admin.username,
        },
      });
      // 渔获费 = 各收费档重量×单价之和（免重档不计费），统一在 recalc 里算
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
