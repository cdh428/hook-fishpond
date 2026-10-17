import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { bangkokDateString } from "@/lib/date-utils";
import { isClosedDate } from "@/lib/closed-days";
import { reserveStock, InsufficientStockError } from "@/lib/stock";
import { generateOrderNumber, recalcOrderTotals } from "@/lib/orders";
import { resolveOrderLines, OptionError } from "@/lib/menu-options-server";
import { requireAdmin, getUserFromRequest } from "@/lib/auth";

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

    // ----- 外带取餐时间（仅外带；限「15 分钟前 ~ 7 天后」） -----
    let pickupAt: Date | null = null;
    if (orderType === "TAKEAWAY" && body.pickupAt) {
      const d = new Date(body.pickupAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid pickupAt" }, { status: 400 });
      }
      const now = Date.now();
      if (d.getTime() < now - 15 * 60 * 1000 || d.getTime() > now + 7 * 24 * 3600 * 1000) {
        return NextResponse.json(
          { error: "pickupAt must be within the next 7 days" },
          { status: 400 },
        );
      }
      pickupAt = d;
    }

    // ----- 后付堂食合单判断：先算好新菜行；若同桌已有未结清订单则并入，否则新开 -----
    // 规则：只有「堂食 + 后付(POSTPAID)」才合并（一张桌最后统一结一次账）；
    //       先付(PREPAID)当场付钱、外带(TAKEAWAY)无桌，都必须独立成单。
    const willMerge = orderType === "DINE_IN" && settlementMode === "POSTPAID" && !!tableId;
    let mergedInto: { id: string; orderNumber: string } | null = null;

    let order: { id: string } | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await runTx(async (tx) => {
          const { lines, subtotal } = await resolveOrderLines(tx, items);

          // —— 合并分支：同桌最早一张未结清订单 ——
          if (willMerge && tableId) {
            const existing = await tx.order.findFirst({
              where: {
                tableId,
                settlementMode: "POSTPAID",
                // 与「本桌账单」接口同款判定：只要未结清就并入
                // （含 PENDING/PREPARING/READY/SERVED；SETTLED/CANCELLED 除外）
                status: { notIn: ["SETTLED", "CANCELLED"] },
              },
              orderBy: { createdAt: "asc" },
              select: { id: true, orderNumber: true },
            });
            if (existing) {
              // 追加菜品行（每行带 optionKey，库存预占按行精确挂到对应 orderItem）
              await tx.orderItem.createMany({
                data: lines.map((l) => ({
                  orderId: existing.id,
                  menuItemId: l.menuItemId,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  totalPrice: l.totalPrice,
                  optionKey: l.optionKey,
                  note: l.note,
                  ...(l.options ? { options: l.options as unknown as Prisma.InputJsonValue } : {}),
                })),
              });

              // 预占库存：先读出刚插入的行拿到各 orderItemId，再逐行挂预占
              const addedItems = await tx.orderItem.findMany({
                where: {
                  orderId: existing.id,
                  menuItemId: { in: lines.map((l) => l.menuItemId) },
                },
                select: { id: true, menuItemId: true, quantity: true, optionKey: true },
              });
              await reserveStock(
                tx,
                existing.id,
                addedItems.map((it) => ({
                  menuItemId: it.menuItemId,
                  quantity: it.quantity,
                  optionKey: it.optionKey,
                  orderItemId: it.id,
                })),
              );

              // 重算订单小计/渔获/折扣/应付（全量按行+称重+折扣）
              await recalcOrderTotals(tx, existing.id);

              mergedInto = { id: existing.id, orderNumber: existing.orderNumber };
              return { id: existing.id, orderNumber: existing.orderNumber };
            }
          }

          // —— 新开分支（先付 / 外带 / 无同桌未结清订单）——
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
              pickupAt,
              status: "PENDING",
              items: {
                create: lines.map((l) => ({
                  menuItemId: l.menuItemId,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  totalPrice: l.totalPrice,
                  optionKey: l.optionKey,
                  note: l.note,
                  ...(l.options ? { options: l.options as unknown as Prisma.InputJsonValue } : {}),
                })),
              },
            },
            include: { items: true },
          });

          if (bookingId) {
            await tx.booking.updateMany({
              where: { id: bookingId },
              data: { orderId: newOrder.id },
            });
          }

          // 下单即预占库存（不足时事务内抛 InsufficientStockError，整体回滚）
          // 逐行带上 orderItemId，避免同菜多规格时预占写重
          await reserveStock(
            tx,
            newOrder.id,
            newOrder.items.map((it) => ({
              menuItemId: it.menuItemId,
              quantity: it.quantity,
              optionKey: it.optionKey,
              orderItemId: it.id,
            })),
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

    // 合并时额外带一个标志，方便前端提示「已并入本桌账单」
    if (mergedInto) {
      return NextResponse.json(
        { ...(fullOrder || {}), mergedIntoOrder: mergedInto, merged: true },
        { status: 200 },
      );
    }
    return NextResponse.json(fullOrder || order, { status: 201 });
  } catch (error: any) {
    if (error instanceof OptionError) {
      return NextResponse.json(
        { error: error.humanMessage, code: error.code },
        { status: 400 },
      );
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `${error.itemName} 已售罄，请调整购物车` },
        { status: 400 },
      );
    }
    console.error("Create order error:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/orders —— 查订单列表
 *
 * ⚠️ 安全口径（2026-09-26 收紧）：与 `/api/bookings` 完全一致 ——
 * **已移除 `?phone=` 查询**（手机号可枚举，前端也从没用过），
 * 顾客端只认 `x-user-id` 请求头且必须与查询串里的 `userId` 一致；管理端可查任意 userId。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");

    const admin = await requireAdmin(request);
    let targetUserId: string | null = null;

    if (admin) {
      if (!requestedUserId) {
        return NextResponse.json(
          { error: "Provide userId query parameter" },
          { status: 400 },
        );
      }
      targetUserId = requestedUserId;
    } else {
      const me = await getUserFromRequest(request);
      if (!me) {
        return NextResponse.json(
          { error: "Not authenticated" },
          { status: 401 },
        );
      }
      if (requestedUserId && requestedUserId !== me.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      targetUserId = me.id;
    }

    const orders = await prisma.order.findMany({
      where: { userId: targetUserId },
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
      { error: "Failed to list orders" },
      { status: 500 },
    );
  }
}
