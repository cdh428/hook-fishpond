import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bangkokDateString } from "@/lib/date-utils";
import { isClosedDate } from "@/lib/closed-days";
import { decrementStock, InsufficientStockError } from "@/lib/stock";

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

    // Generate order number: FP-{YYYYMMDD}-{3-digit-sequence}
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `FP-${dateStr}-`;

    // Find today's orders to get next sequence
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const todayCount = await prisma.order.count({
      where: {
        createdAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    const seq = String(todayCount + 1).padStart(3, "0");
    const orderNumber = `${prefix}${seq}`;

    // Create order with items in a transaction; link booking if provided
    const order = await prisma.$transaction(async (tx) => {
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
          status: "PENDING",
          items: {
            create: orderItemsData,
          },
        },
      });

      if (bookingId) {
        await tx.booking.updateMany({
          where: { id: bookingId },
          data: { orderId: newOrder.id },
        });
      }

      // 扣减库存（不足时事务内抛 InsufficientStockError，整体回滚）
      await decrementStock(
        tx,
        orderItemsData.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        { orderId: newOrder.id },
      );

      return newOrder;
    });

    // Fetch complete order with relations
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: { include: { menuItem: true } },
        bookings: true,
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
