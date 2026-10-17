import type { Prisma } from "@prisma/client";
import { round2 } from "./orders";

/**
 * 收款流水工具（2026-10-17）
 *
 * 财务口径见 docs/playbooks/finance-rules-cashier.md，三条铁律：
 *  1. 流水**只追加不覆盖** —— 记错就标 voidedAt 作废，或追加一条负数 REFUND，绝不 update 金额。
 *  2. Order.prepaidAmount 是**派生存量**，永远 = Σ(未作废流水)，不能手工加减。
 *  3. 需付 = max(0, 总应付 − 实收)，不出现负数欠款；多收单列为「需退」。
 */

export { round2 } from "./orders";

/** 支持在事务内外复用：传 PrismaClient 或事务 client 均可 */
type Db = Prisma.TransactionClient | {
  paymentRecord: Prisma.TransactionClient["paymentRecord"];
  order: Prisma.TransactionClient["order"];
};

export interface PaymentRecordRow {
  id: string;
  amount: number;
  method: string;
  kind: string;
  operator: string | null;
  note: string | null;
  paidAt: Date;
  voidedAt: Date | null;
}

/** 该单实收（Σ 未作废流水；REFUND 本身为负数，直接相加即可） */
export async function sumCollected(db: Db, orderId: string): Promise<number> {
  const rows = await db.paymentRecord.findMany({
    where: { orderId, voidedAt: null },
    select: { amount: true },
  });
  return round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
}

/**
 * 把 Order.prepaidAmount 重算成流水之和。
 * 每次写流水之后必须调用一次，否则显示口径会和账不符。
 */
export async function syncPrepaidFromRecords(db: Db, orderId: string): Promise<number> {
  const collected = await sumCollected(db, orderId);
  await db.order.update({
    where: { id: orderId },
    data: { prepaidAmount: collected },
  });
  return collected;
}

/** 追加一条流水（只增不改） */
export async function addPaymentRecord(
  db: Db,
  input: {
    orderId: string;
    amount: number;
    method?: "CASH" | "PROMPTPAY" | "TRUEMONEY" | "BANK_TRANSFER" | "CREDIT_CARD" | "ALIPAY" | "WECHAT_PAY";
    kind?: "DEPOSIT" | "PARTIAL" | "FINAL" | "REFUND";
    operator?: string | null;
    note?: string | null;
    paidAt?: Date;
  },
) {
  return db.paymentRecord.create({
    data: {
      orderId: input.orderId,
      amount: round2(input.amount),
      method: (input.method ?? "CASH") as any,
      kind: (input.kind ?? "PARTIAL") as any,
      operator: input.operator ?? null,
      note: input.note ?? null,
      paidAt: input.paidAt ?? new Date(),
    },
  });
}

/** 该单完整流水（时间正序，像账本一样从早到晚读） */
export async function listPaymentRecords(db: Db, orderId: string): Promise<PaymentRecordRow[]> {
  const rows = await db.paymentRecord.findMany({
    where: { orderId },
    orderBy: { paidAt: "asc" },
    select: {
      id: true,
      amount: true,
      method: true,
      kind: true,
      operator: true,
      note: true,
      paidAt: true,
      voidedAt: true,
    },
  });
  return rows as PaymentRecordRow[];
}
