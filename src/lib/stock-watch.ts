import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { consumeReservation, releaseOrderStock } from "@/lib/stock";

/**
 * 订单 ↔ 库存 挂钩体检 —— 回答一个问题：
 * **有没有「卖了但没扣库存」的单？**
 *
 * 会计上这叫「销售与存货结转是否匹配」。四条待查形态：
 *
 * | 代号 | 形态 | 后果 |
 * |---|---|---|
 * | `SETTLED_UNPOSTED` | 已结清，但台账上没有对应的出库分录 | **卖了没扣**（最严重） |
 * | `OPEN_UNRESERVED`  | 进行中订单的外购行没有预占 | 结账时可能扣不到；也可能超卖 |
 * | `STALE_RESERVATION`| 进行中订单长期占着预占不放 | 可售量被虚减（反方向的漏） |
 * | `RESIDUAL_RESERVATION` | 终态订单还残留预占 | 同上，且结清逻辑没走完 |
 *
 * 前两类可以靠结算时的「台账补记」自动修复（见 `consumeReservation`）；
 * 已经结清的漏扣单，用 `repairOrderStock()` 补记。
 */

export type OrderLinkKind =
  | "SETTLED_UNPOSTED"
  | "OPEN_UNRESERVED"
  | "STALE_RESERVATION"
  | "RESIDUAL_RESERVATION";

export interface OrderLinkLine {
  orderItemId: string;
  name: string;
  quantity: number;
  reservedQty: number;
  /** 台账上已经出库的净量（正数） */
  posted: number;
}

export interface OrderLinkIssue {
  kind: OrderLinkKind;
  orderId: string;
  orderNumber: string;
  status: string;
  settlementMode: string;
  createdAt: string;
  /** 已结清 / 已取消的时刻 */
  closedAt: string | null;
  /** 未结清的挂账时长（小时） */
  ageHours: number;
  lines: OrderLinkLine[];
  /** 该单涉及的差额件数（绝对值合计） */
  gap: number;
}

/** 超过这个时长仍持有预占 → 视为「僵尸预占」 */
export const STALE_RESERVATION_HOURS = 6;

interface RawRow {
  kind: OrderLinkKind;
  order_id: string;
  order_number: string;
  status: string;
  settlement_mode: string;
  created_at: Date;
  closed_at: Date | null;
  age_hours: number;
  order_item_id: string;
  name: string;
  quantity: number;
  reserved_qty: number;
  posted: number;
}

/**
 * 逐行体检。一次 SQL 取回所有可疑行，再在内存里归组成「按订单」的问题单。
 *
 * @param staleHours 预占挂账多久算异常
 */
export async function auditOrderStockLink(
  staleHours = STALE_RESERVATION_HOURS,
): Promise<{ issues: OrderLinkIssue[]; counts: Record<OrderLinkKind, number> }> {
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `
    with line_posted as (
      select oi.id                                          as order_item_id,
             oi."orderId"                                   as order_id,
             oi."menuItemId"                                as item_id,
             oi.quantity                                    as quantity,
             oi."reservedQty"                               as reserved_qty,
             m."name_zh"                                    as name,
             o.id                                           as o_id,
             o."orderNumber"                                as order_number,
             o.status                                       as status,
             o."settlementMode"                             as settlement_mode,
             o."createdAt"                                  as created_at,
             coalesce(o."settledAt", o."updatedAt")         as closed_at,
             extract(epoch from (now() - o."createdAt"))/3600 as age_hours,
             coalesce((
               select sum(sm.quantity) from "StockMovement" sm
               where sm."orderId" = oi."orderId"
                 and sm."itemId"  = oi."menuItemId"
                 and sm."voidedAt" is null
                 and sm."balanceAfter" is not null
                 and (sm."idempotencyKey" = 'sale:'  || oi.id
                   or sm."idempotencyKey" = 'cancel:' || oi.id
                   or sm."idempotencyKey" like 'sale:' || oi.id || '#%')
             ), 0)::int                                     as posted
      from "OrderItem" oi
      join "Order" o    on o.id = oi."orderId"
      join "MenuItem" m on m.id = oi."menuItemId"
      where m."stockType" = 'PURCHASED'
    )
    select * from (
      -- ① 已结清，但台账上没有（足额）出库 —— 卖了没扣
      select 'SETTLED_UNPOSTED'::text as kind, lp.*
      from line_posted lp
      where lp.status = 'SETTLED'
        and lp.quantity > 0
        and lp.quantity + lp.posted <> 0

      union all

      -- ② 进行中订单的外购行没有预占 —— 结账时不会有扣减
      select 'OPEN_UNRESERVED'::text, lp.*
      from line_posted lp
      where lp.status not in ('SETTLED','CANCELLED')
        and lp.quantity > 0
        and lp.reserved_qty = 0
        and lp.posted = 0

      union all

      -- ③ 进行中长期占着预占不放
      select 'STALE_RESERVATION'::text, lp.*
      from line_posted lp
      where lp.status not in ('SETTLED','CANCELLED')
        and lp.reserved_qty > 0
        and lp.age_hours > $1

      union all

      -- ④ 终态订单残留预占
      select 'RESIDUAL_RESERVATION'::text, lp.*
      from line_posted lp
      where lp.status in ('SETTLED','CANCELLED')
        and lp.reserved_qty > 0
    ) x
    order by x.created_at desc
    `,
    staleHours,
  );

  const byOrder = new Map<string, OrderLinkIssue>();
  const counts: Record<OrderLinkKind, number> = {
    SETTLED_UNPOSTED: 0,
    OPEN_UNRESERVED: 0,
    STALE_RESERVATION: 0,
    RESIDUAL_RESERVATION: 0,
  };

  for (const r of rows) {
    const key = `${r.kind}:${r.order_id}`;
    let issue = byOrder.get(key);
    if (!issue) {
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
      issue = {
        kind: r.kind,
        orderId: r.order_id,
        orderNumber: r.order_number,
        status: r.status,
        settlementMode: r.settlement_mode,
        createdAt: new Date(r.created_at).toISOString(),
        closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
        ageHours: Math.round(Number(r.age_hours)),
        lines: [],
        gap: 0,
      };
      byOrder.set(key, issue);
    }
    issue.lines.push({
      orderItemId: r.order_item_id,
      name: r.name,
      quantity: Number(r.quantity),
      reservedQty: Number(r.reserved_qty),
      posted: -Number(r.posted),
    });
    issue.gap +=
      r.kind === "SETTLED_UNPOSTED"
        ? Math.abs(Number(r.quantity) + Number(r.posted))
        : Number(r.quantity);
  }

  return { issues: [...byOrder.values()], counts };
}

/**
 * 补记某个订单漏掉的出库（「卖了没扣」的修复）。
 *
 * 幂等：靠台账差额与幂等键判断，重复执行不会重复扣减。
 */
export async function repairOrderStock(
  orderId: string,
  opts: { adminName?: string } = {},
): Promise<{ consumed: number; healed: number }> {
  return runTx(async (tx) => {
    const result = await consumeReservation(tx, orderId, {
      adminName: opts.adminName,
      force: true,
    });
    return { consumed: result.consumed, healed: result.healed };
  });
}

/**
 * 清扫僵尸预占：把「先付 + 支付已失败/过期 + 仍未结清」的订单取消掉，
 * 释放它占住的库存。顾客显然不会再来付这单了。
 *
 * 后付订单**不动** —— 菜可能已经上桌，必须由人来判断。
 *
 * @param apply false = 只报告不执行（默认）
 */
export async function sweepStaleReservations(opts: { apply?: boolean } = {}): Promise<{
  candidates: {
    orderId: string;
    orderNumber: string;
    held: number;
    ageHours: number;
    paymentStatus: string | null;
  }[];
  released: number;
}> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    select o.id, o."orderNumber", o."createdAt",
           sum(oi."reservedQty")::int as held,
           round(extract(epoch from (now() - o."createdAt"))/3600)::int as age_hours,
           p.status::text as payment_status
    from "Order" o
    join "OrderItem" oi on oi."orderId" = o.id
    left join "Payment" p on p."orderId" = o.id
    where o.status not in ('SETTLED','CANCELLED')
      and oi."reservedQty" > 0
      and o."settlementMode" = 'PREPAID'
      and (p.status is null or p.status in ('FAILED','PENDING'))
      and (
        p.status = 'FAILED'
        or (p."expiresAt" is not null and p."expiresAt" < now() - interval '15 minutes')
        or o."createdAt"      < now() - interval '6 hours'
      )
    group by o.id, o."orderNumber", o."createdAt", p.status
    order by o."createdAt" asc
    `,
  );

  const candidates = rows.map((r) => ({
    orderId: r.id,
    orderNumber: r.orderNumber,
    held: Number(r.held),
    ageHours: Number(r.age_hours),
    paymentStatus: r.payment_status ?? null,
  }));

  if (!opts.apply) return { candidates, released: 0 };

  let released = 0;
  for (const c of candidates) {
    await runTx(async (tx) => {
      await releaseOrderStock(tx, c.orderId, { adminName: "auto-sweep" });
      await tx.order.update({
        where: { id: c.orderId },
        data: { status: "CANCELLED" },
      });
    });
    released += c.held;
  }
  return { candidates, released };
}
