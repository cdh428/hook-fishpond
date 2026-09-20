import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createPurchaseReceipt } from "@/lib/stock-docs";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

const ITEM_SELECT = { name_zh: true, name_en: true, name_th: true } as const;

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.purchaseReceipt.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { lines: { include: { menuItem: { select: ITEM_SELECT } } } },
    });

    return NextResponse.json({
      receipts: rows.map((r) => ({
        id: r.id,
        code: r.code,
        supplier: r.supplier,
        docDate: r.docDate,
        totalAmount: r.totalAmount,
        note: r.note,
        adminName: r.adminName,
        reversedAt: r.reversedAt,
        createdAt: r.createdAt,
        lines: r.lines.map((l) => ({
          id: l.id,
          menuItemId: l.menuItemId,
          name_zh: l.menuItem.name_zh,
          name_en: l.menuItem.name_en,
          name_th: l.menuItem.name_th,
          qty: l.qty,
          unitCost: l.unitCost,
          amount: l.amount,
        })),
      })),
    });
  } catch (error) {
    return ledgerErrorResponse(error, "List purchase receipts error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = await createPurchaseReceipt({
      lines: Array.isArray(body.lines) ? body.lines : [],
      supplier: body.supplier ?? null,
      docDate: body.docDate ? new Date(body.docDate) : null,
      note: body.note ?? null,
      adminName: admin.username,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return ledgerErrorResponse(error, "Create purchase receipt error");
  }
}
