import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrementStock, restoreStock, InsufficientStockError } from "@/lib/stock";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { menuItem: true } },
        payment: true,
        bookings: { include: { pond: true, spot: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Get order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get order" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { status } = await request.json();

    const validStatuses = ["PENDING", "PAID", "PREPARING", "READY", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }

    // 先读取当前订单状态，决定库存回补/重扣
    const current = await prisma.order.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const prevStatus = current.status;

    const movingIntoCancelled = status === "CANCELLED" && prevStatus !== "CANCELLED";
    const movingOutOfCancelled = prevStatus === "CANCELLED" && status !== "CANCELLED";

    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
          where: { id },
          data: { status },
          include: {
            items: { include: { menuItem: true } },
            payment: true,
          },
        });

        if (movingIntoCancelled) {
          // 取消/拒单：回补库存（PURCHASED 增库存；MADE 记冲正流水）
          await restoreStock(tx, id);
        } else if (movingOutOfCancelled) {
          // 从取消恢复：重新扣减库存
          const ois = await tx.orderItem.findMany({
            where: { orderId: id },
            include: { menuItem: true },
          });
          const lines = ois.map((oi) => ({
            menuItemId: oi.menuItemId,
            quantity: oi.quantity,
          }));
          await decrementStock(tx, lines, { orderId: id });
        }

        return updated;
      });
    } catch (error: any) {
      if (error instanceof InsufficientStockError) {
        return NextResponse.json(
          { error: `${error.itemName} 已售罄，请调整购物车` },
          { status: 400 },
        );
      }
      throw error;
    }

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Update order error:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to update order" },
      { status: 500 },
    );
  }
}
