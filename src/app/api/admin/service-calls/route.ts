import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const maxDuration = 60;

/**
 * 后台 —— 呼叫服务看板
 *
 * GET  /api/admin/service-calls               → 待处理 + 最近已处理
 * PATCH /api/admin/service-calls { id, status } → 响应 / 完成
 *
 * 看板只关心「还没处理完的」：默认返回 PENDING 全部 + 最近 2 小时的
 * ACKNOWLEDGED，避免已完成的单把屏幕刷满。
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const [pending, recent] = await Promise.all([
      prisma.serviceCall.findMany({
        where: { status: { in: ["PENDING", "ACKNOWLEDGED"] } },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
      prisma.serviceCall.findMany({
        where: { status: "DONE", createdAt: { gte: since } },
        orderBy: { handledAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      pending,
      recent,
      pendingCount: pending.filter((c) => c.status === "PENDING").length,
    });
  } catch (error: any) {
    console.error("Admin list service calls error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list service calls" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "");
    const status = String(body?.status || "");

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!["ACKNOWLEDGED", "DONE", "PENDING"].includes(status)) {
      return NextResponse.json(
        { error: "status must be ACKNOWLEDGED | DONE | PENDING" },
        { status: 400 },
      );
    }

    const existing = await prisma.serviceCall.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Service call not found" }, { status: 404 });
    }

    const call = await prisma.serviceCall.update({
      where: { id },
      data: {
        status: status as any,
        handledBy: status === "PENDING" ? null : admin.username,
        handledAt: status === "PENDING" ? null : new Date(),
      },
    });

    return NextResponse.json({ ok: true, call });
  } catch (error: any) {
    console.error("Admin update service call error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update service call" },
      { status: 500 },
    );
  }
}
