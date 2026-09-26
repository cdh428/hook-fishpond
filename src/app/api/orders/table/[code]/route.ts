import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

/**
 * GET /api/orders/table/[code] —— 本桌账单（顾客可见）
 *
 * 后付模式下顾客最焦虑的就是「我这一桌点了多少、还要付多少」，
 * 以前只能反复叫服务员问。这里把该桌**所有未结清订单**汇总成一个视图：
 *  - 已点菜品（含规格与备注）
 *  - 菜品小计、渔获费、折扣、当前应付
 *  - 按订单分组，方便核对是不是自己的
 *
 * 只返回未结清（非 SETTLED / CANCELLED）的订单；已结清的账单不在「当前消费」里。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const normalized = String(code || "").toUpperCase().trim();
    if (!/^[A-Z0-9]{1,8}$/.test(normalized)) {
      return NextResponse.json({ error: "Invalid table code" }, { status: 400 });
    }

    const table = await prisma.diningTable.findUnique({
      where: { code: normalized },
    });
    if (!table || !table.isActive) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const orders = await prisma.order.findMany({
      where: {
        tableId: table.id,
        status: { notIn: ["SETTLED", "CANCELLED"] },
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: { name_zh: true, name_en: true, name_th: true },
            },
          },
        },
        weighings: { select: { weightKg: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    let itemSubtotal = 0;
    let itemCount = 0;
    for (const o of orders) {
      for (const it of o.items) {
        itemSubtotal += it.totalPrice;
        itemCount += it.quantity;
      }
    }

    return NextResponse.json({
      table: {
        id: table.id,
        code: table.code,
        name_zh: table.name_zh,
        name_en: table.name_en,
        name_th: table.name_th,
        area: table.area,
      },
      summary: {
        orderCount: orders.length,
        itemCount,
        itemSubtotal: Math.round(itemSubtotal * 100) / 100,
        // 当前应付（含已录入的渔获费与折扣；结账前仍可能变动）
        payable: Math.round(orders.reduce((s, o) => s + o.totalPrice, 0) * 100) / 100,
        unsettled: orders.length > 0,
      },
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        settlementMode: o.settlementMode,
        createdAt: o.createdAt,
        pickupAt: o.pickupAt,
        subtotal: o.subtotal,
        fishWeightKg: o.fishWeightKg,
        fishCharge: o.fishCharge,
        discountAmount: o.discountAmount,
        totalPrice: o.totalPrice,
        note: o.note,
        items: o.items.map((it) => ({
          id: it.id,
          menuItemId: it.menuItemId,
          name_zh: it.menuItem?.name_zh ?? "",
          name_en: it.menuItem?.name_en ?? "",
          name_th: it.menuItem?.name_th ?? "",
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          options: it.options ?? null,
          note: it.note,
        })),
      })),
    });
  } catch (error: any) {
    console.error("Table bill error:", error);
    return NextResponse.json(
      { error: "Failed to load table bill" },
      { status: 500 },
    );
  }
}
