import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { reserveStock, releaseOrderStock, InsufficientStockError } from "@/lib/stock";
import { settleOrder } from "@/lib/orders";

// Neon(us-east-2) ← 泰国：往返延迟较高，放宽函数执行上限
export const maxDuration = 60;

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
        weighings: { orderBy: { createdAt: "asc" } },
        table: true,
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

const VALID_STATUSES = [
  "PENDING",
  "PAID",
  "PREPARING",
  "READY",
  "SERVED",
  "SETTLED",
  "CANCELLED",
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { status } = await request.json();

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const current = await prisma.order.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const prevStatus = current.status;

    const movingIntoCancelled = status === "CANCELLED" && prevStatus !== "CANCELLED";
    const movingOutOfCancelled = prevStatus === "CANCELLED" && status !== "CANCELLED";
    const movingIntoSettled = status === "SETTLED" && prevStatus !== "SETTLED";

    let order;
    try {
      order = await runTx(async (tx) => {
        if (movingIntoSettled) {
          // 结清：预占转正式扣减 + 状态置 SETTLED
          await settleOrder(tx, id);
          return tx.order.findUnique({
            where: { id },
            include: { items: { include: { menuItem: true } }, payment: true },
          });
        }

        const updated = await tx.order.update({
          where: { id },
          data: {
            status,
            ...(status !== "SETTLED" ? { settledAt: null } : {}),
          },
          include: {
            items: { include: { menuItem: true } },
            payment: true,
          },
        });

        if (movingIntoCancelled) {
          // 取消：释放预占，已扣减部分回补
          await releaseOrderStock(tx, id);
        } else if (movingOutOfCancelled) {
          // 从取消恢复：重新预占
          const ois = await tx.orderItem.findMany({ where: { orderId: id } });
          await reserveStock(
            tx,
            id,
            ois.map((oi) => ({ menuItemId: oi.menuItemId, quantity: oi.quantity })),
          );
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
