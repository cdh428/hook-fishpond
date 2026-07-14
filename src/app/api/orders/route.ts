import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, customerName, customerPhone, items, bookingId, note } = body;

    if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: customerName, customerPhone, items[]" },
        { status: 400 },
      );
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
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });
    const seq = String(todayCount + 1).padStart(3, "0");
    const orderNumber = `${prefix}${seq}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: userId || null,
        customerName,
        customerPhone,
        subtotal,
        totalPrice: subtotal,
        note: note || null,
        status: "PENDING",
        items: {
          create: orderItemsData,
        },
        ...(bookingId && {
          bookings: { connect: { id: bookingId } },
        }),
      },
      include: {
        items: { include: { menuItem: true } },
        bookings: true,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
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
