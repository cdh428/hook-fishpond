import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { reversePurchaseReceipt } from "@/lib/stock-docs";
import { ledgerErrorResponse } from "@/lib/stock-ledger";

const ITEM_SELECT = { name_zh: true, name_en: true, name_th: true } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const r = await prisma.purchaseReceipt.findUnique({
      where: { id },
      include: { lines: { include: { menuItem: { select: ITEM_SELECT } } } },
    });
    if (!r) {
      return NextResponse.json({ error: "Purchase receipt not found" }, { status: 404 });
    }

    // 该单据产生的全部分录（含冲销分录），便于审计追溯
    const movements = await prisma.stockMovement.findMany({
      where: { docType: "PURCHASE_RECEIPT", docId: id },
      orderBy: { createdAt: "asc" },
      include: { item: { select: ITEM_SELECT } },
    });

    return NextResponse.json({
      receipt: {
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
      },
      movements: movements.map((m) => ({
        id: m.id,
        name_zh: m.item.name_zh,
        type: m.type,
        quantity: m.quantity,
        unitCost: m.unitCost,
        amount: m.amount,
        balanceAfter: m.balanceAfter,
        reversalOf: m.reversalOf,
        note: m.note,
        adminName: m.adminName,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    return ledgerErrorResponse(error, "Get purchase receipt error");
  }
}

/** 作废（红字冲销）整张进货单 */
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
    if (body?.action !== "reverse") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const result = await reversePurchaseReceipt(id, {
      adminName: admin.username,
      note: body.note ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return ledgerErrorResponse(error, "Reverse purchase receipt error");
  }
}
