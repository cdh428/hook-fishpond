import { NextRequest, NextResponse } from "next/server";
import { supabase, genId } from "@/lib/supabase-server";

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
    const { data: menuItems, error: menuError } = await supabase
      .from("MenuItem")
      .select("*")
      .in("id", menuItemIds);

    if (menuError) throw menuError;

    const menuItemMap = new Map((menuItems || []).map((m: any) => [m.id, m]));

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
        id: genId(),
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
    const { count: todayCount } = await supabase
      .from("Order")
      .select("*", { count: "exact", head: true })
      .gte("createdAt", todayStart.toISOString())
      .lt("createdAt", todayEnd.toISOString());

    const seq = String((todayCount || 0) + 1).padStart(3, "0");
    const orderNumber = `${prefix}${seq}`;

    const orderId = genId();

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from("Order")
      .insert({
        id: orderId,
        orderNumber,
        userId: userId || null,
        customerName,
        customerPhone,
        subtotal,
        totalPrice: subtotal,
        note: note || null,
        status: "PENDING",
      })
      .select("*")
      .single();

    if (orderError) throw orderError;

    // Create order items
    const orderItemsWithOrderId = orderItemsData.map((item) => ({
      ...item,
      orderId,
    }));

    const { error: itemsError } = await supabase
      .from("OrderItem")
      .insert(orderItemsWithOrderId);

    if (itemsError) throw itemsError;

    // Link booking to order if bookingId provided
    if (bookingId) {
      await supabase
        .from("Booking")
        .update({ orderId })
        .eq("id", bookingId);
    }

    // Fetch complete order with relations
    const { data: fullOrder } = await supabase
      .from("Order")
      .select("*, items:OrderItem(*, menuItem:MenuItem(*)), bookings:Booking(*)")
      .eq("id", orderId)
      .single();

    return NextResponse.json(fullOrder || order, { status: 201 });
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

    let query = supabase
      .from("Order")
      .select("*, items:OrderItem(*, menuItem:MenuItem(*)), payment:Payment(*), bookings:Booking(*)")
      .order("createdAt", { ascending: false });

    if (userId) {
      query = query.eq("userId", userId);
    } else {
      query = query.eq("customerPhone", phone!);
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    return NextResponse.json(orders || []);
  } catch (error: any) {
    console.error("List orders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list orders" },
      { status: 500 },
    );
  }
}
