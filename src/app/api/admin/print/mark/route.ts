import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 与 watch 同源的内部 token（从 DATABASE_URL 派生） */
function expectedToken(): string {
  const s = process.env.PRINT_WATCH_TOKEN || process.env.DATABASE_URL;
  if (!s) return "";
  return createHmac("sha256", s).update("hook-fishpond-print-watch-v1").digest("hex");
}

function checkToken(request: NextRequest): boolean {
  const expect = expectedToken();
  if (!expect) return false;
  const got = request.headers.get("x-print-token") || "";
  return got === expect;
}

/**
 * POST /api/admin/print/mark —— 桥打完回写（内部）
 *
 * body: { id: string, state?: "PRINTED" | "FAILED", error?: string }
 *
 * 语义与 /api/admin/orders/[id]/auto-print 一致：
 *  - 两联都成功 → PRINTED（不可降级）
 *  - 失败 → FAILED（等人工补打）
 */
export async function POST(request: NextRequest) {
  if (!checkToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = body?.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    const state = body?.state === "FAILED" ? "FAILED" : "PRINTED";
    const error = body?.error ? String(body.error).slice(0, 300) : null;

    const existing = await prisma.order.findUnique({
      where: { id },
      select: { printState: true, printedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    // 已 PRINTED 不可降级
    if (existing.printState === "PRINTED" && state === "FAILED") {
      return NextResponse.json({ id, printState: "PRINTED", printedAt: existing.printedAt });
    }

    const now = new Date();
    const order = await prisma.order.update({
      where: { id },
      data:
        state === "PRINTED"
          ? { printState: "PRINTED", printedAt: now, printError: null, autoPrintFired: true }
          : { printState: "FAILED", printError: error },
      select: { id: true, printState: true, printedAt: true, printError: true },
    });
    return NextResponse.json(order);
  } catch (error: any) {
    console.error("mark error:", error);
    return NextResponse.json({ error: "mark failed" }, { status: 500 });
  }
}
