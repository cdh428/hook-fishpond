import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createStockTake } from "@/lib/stock-docs";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

const ITEM_SELECT = { name_zh: true, name_en: true, name_th: true } as const;

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.stockTake.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { lines: { include: { menuItem: { select: ITEM_SELECT } } } },
    });

    return NextResponse.json({
      takes: rows.map((t) => ({
        id: t.id,
        code: t.code,
        note: t.note,
        adminName: t.adminName,
        createdAt: t.createdAt,
        lines: t.lines.map((l) => ({
          id: l.id,
          menuItemId: l.menuItemId,
          name_zh: l.menuItem.name_zh,
          name_en: l.menuItem.name_en,
          name_th: l.menuItem.name_th,
          bookQty: l.bookQty,
          actualQty: l.actualQty,
          diff: l.diff,
        })),
      })),
    });
  } catch (error) {
    return ledgerErrorResponse(error, "List stock takes error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = await createStockTake({
      lines: Array.isArray(body.lines) ? body.lines : [],
      note: body.note ?? null,
      adminName: admin.username,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return ledgerErrorResponse(error, "Create stock take error");
  }
}
