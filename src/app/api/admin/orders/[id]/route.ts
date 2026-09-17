import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * PATCH /api/admin/orders/[id]
 * Admin-only order edits. Currently supports rebinding the dining table:
 *   { tableCode: "A01" }  → attach / move the order to that table
 *   { tableCode: null }   → detach the order from any table
 *
 * Used when a customer moves tables or orders without scanning the QR.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const tableCode = body?.tableCode ?? undefined;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const data: { tableId: string | null; orderType?: "DINE_IN" | "TAKEAWAY" } = {
      tableId: null,
    };

    if (tableCode !== null && tableCode !== undefined) {
      const table = await prisma.diningTable.findUnique({
        where: { code: String(tableCode).toUpperCase() },
      });
      if (!table || !table.isActive) {
        return NextResponse.json(
          { error: "Invalid or inactive table code" },
          { status: 400 },
        );
      }
      data.tableId = table.id;
      data.orderType = "DINE_IN";
    } else {
      // Explicitly detached → treat as takeaway so the label stays truthful.
      data.orderType = "TAKEAWAY";
    }

    const updated = await prisma.order.update({
      where: { id },
      data,
      include: {
        items: { include: { menuItem: true } },
        payment: true,
        bookings: true,
        table: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Admin update order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update order" },
      { status: 500 },
    );
  }
}
