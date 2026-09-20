import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { bangkokDateString } from "@/lib/date-utils";
import { isClosedDate } from "@/lib/closed-days";
import { reserveStock, InsufficientStockError } from "@/lib/stock";
import { generateOrderNumber } from "@/lib/orders";

// Neon(us-east-2) ← 泰国：往返延迟较高，放宽函数执行上限
export const maxDuration = 60;

/**
 * POST /api/orders —— 顾客「确认下单」
 *
 * 与旧流程的区别：
 *  - 不再「下单即付款」，而是下单即**预占库存**（不动 stockQty、不写流水）；
 *  - 顾客可自选结算方式：PREPAID（立即付款）/ POSTPAID（最后结算）；
 *  - 正式扣库存发生在结算时点（后付=结清、先付=付款到账）。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, customerName, customerPhone, items, bookingId, note, tableCode } = body;

    if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: customerName, customerPhone, items[]" },
        { status: 400 },
      );
    }

    // Order type: DINE_IN (default) must be tied to a table, TAKEAWAY never is.
    const orderType: "DINE_IN" | "TAKEAWAY" =
      body.orderType === "TAKEAWAY" ? "TAKEAWAY" : "DINE_IN";

    // 结算方式：堂食默认最后结算，外带默认立即付款（顾客都能改）
    const requested = body.settlementMode;
    const settlementMode: "PREPAID" | "POSTPAID" =
      requested === "PREPAID" || requested === "POSTPAID"
        ? requested
        : orderType === "TAKEAWAY"
          ? "PREPAID"
          : "POSTPAID";

    // Block same-day (on-site) ordering when the venue is closed today
    if (await isClosedDate(bangkokDateString())) {
      return NextResponse.json(
        { error: "The venue is closed today" },
        { status: 400 },
      );
    }

    // Resolve dining table. Dine-in orders REQUIRE a valid, active table so
    // staff can serve and settle them; takeaway orders carry no table.
    let tableId: string | null = null;
    if (orderType === "DINE_IN") {
      if (!tableCode) {
        return NextResponse.json(
          { error: "Dine-in orders require a tableCode" },
          { status: 400 },
        );
      }
      const table = await prisma.diningTable.findUnique({
        where: { code: String(tableCode).toUpperCase() },
      });
      if (!table || !table.isActive) {
        return NextResponse.json(
          { error: "Invalid or inactive table code" },
          { status: 400 },
        );
      }
      tableId = table.id;
    }

    // Fetch menu items to calculate prices
    const menuItemIds = items.map((i: any) => i.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
    });

    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    // Build order items and calculate subtotal
    let subtotal = 0;
    const orderItemsData = items.map((i: any) => {
      const menuItem = menuItemMap.get(i.menuItemId);
      if (!menuItem) {
        throw new Error(`Menu item not found: ${i.menuItemId}`);
      }
      const unitPrice = menuItem.price;
      const totalPrice = unitPrice * i.quantity;
      subtotal += totalPrice;
      return {
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        unitPrice,
        totalPrice,
        note: i.note || null,
      };
    });

    // Create order with items in a transaction; link booking if provided.
    // 订单号按当日流水生成，并发下可能撞号 —— 重试三次。
    let order: { id: string } | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await runTx(async (tx) => {
          const orderNumber = await generateOrderNumber(tx, attempt);
          const newOrder = await tx.order.create({
            data: {
              orderNumber,
              userId: userId || null,
              tableId,
              customerName,
              customerPhone,
              subtotal,
              totalPrice: subtotal,
              note: note || null,
              orderType,
              settlementMode,
              status: "PENDING",
              items: { create: orderItemsData },
            },
          });

          if (bookingId) {
            await tx.booking.updateMany({
              where: { id: bookingId },
              data: { orderId: newOrder.id },
            });
          }

          // 下单即预占库存（不足时事务内抛 InsufficientStockError，整体回滚）
          await reserveStock(
            tx,
            newOrder.id,
            orderItemsData.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          );

          return newOrder;
        });
        break;
      } catch (e: any) {
        lastError = e;
        if (e?.code === "P2002") continue;
        throw e;
      }
    }
    if (!order) throw lastError ?? new Error("Failed to create order");

    // Fetch complete order with relations
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: { include: { menuItem: true } },
        bookings: true,
        weighings: true,
        table: true,
      },
    });

    return NextResponse.json(fullOrder || order, { status: 201 });
  } catch (error: any) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `${error.itemName} 已售罄，请调整购物车` },
        { status: 400 },
      );
    }
    console.error("Create order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create order" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const phone = searchParams.get("phone");

    if (!userId && !phone) {
      return NextResponse.json(
        { error: "Provide userId or phone query parameter" },
        { status: 400 },
      );
    }

    const where = userId ? { userId } : { customerPhone: phone! };

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: { include: { menuItem: true } },
        payment: true,
        bookings: true,
        weighings: true,
        table: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(orders);
  } catch (error: any) {
    console.error("List orders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list orders" },
      { status: 500 },
    );
  }
}
