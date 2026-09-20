import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const VALID_TYPES = ["ASSISTANCE", "WATER", "TISSUE", "BILL"] as const;
type CallType = (typeof VALID_TYPES)[number];

/**
 * POST /api/service-calls —— 顾客「呼叫服务员」
 *
 * 茅草屋离吧台远，客人喊不到人。桌号页点一下，后台看板立刻出现提醒。
 *
 * 防刷：同一桌、同一类型、2 分钟内已有 PENDING 的单不再新建，
 * 直接把它返回（顾客连点五下，后台也只闪一条）。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body?.tableCode || "").toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "tableCode is required" }, { status: 400 });
    }

    const type: CallType = (VALID_TYPES as readonly string[]).includes(body?.type)
      ? (body.type as CallType)
      : "ASSISTANCE";

    const note =
      typeof body?.note === "string" && body.note.trim().length > 0
        ? body.note.trim().slice(0, 200)
        : null;

    const table = await prisma.diningTable.findUnique({ where: { code } });
    if (!table || !table.isActive) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const existing = await prisma.serviceCall.findFirst({
      where: {
        tableId: table.id,
        type: type as any,
        status: "PENDING",
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return NextResponse.json({ call: existing, deduped: true }, { status: 200 });
    }

    const call = await prisma.serviceCall.create({
      data: {
        tableId: table.id,
        tableCode: table.code,
        type: type as any,
        note,
        status: "PENDING",
      },
    });

    return NextResponse.json({ call, deduped: false }, { status: 201 });
  } catch (error: any) {
    console.error("Create service call error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create service call" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/service-calls?tableCode=A01 —— 该桌当前待处理的呼叫
 * 顾客端用它显示「已通知服务员，请稍候」的状态。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("tableCode") || "").toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "tableCode is required" }, { status: 400 });
    }

    const calls = await prisma.serviceCall.findMany({
      where: {
        tableCode: code,
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ calls });
  } catch (error: any) {
    console.error("List service calls error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list service calls" },
      { status: 500 },
    );
  }
}
