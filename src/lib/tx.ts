import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 交互式事务（interactive transaction）统一入口。
 *
 * ## 为什么需要它
 * 生产库为 Neon（us-east-2），而主要用户在泰国，单次数据库往返约 200~400ms；
 * 且连接池 `max: 1`。Prisma 交互式事务的**默认上限只有 5000ms**，
 * 而「结算 / 下单 / 改单」这类路径包含十余次串行往返，
 * 极易触发：
 *
 *   Transaction API error: A commit cannot be executed on an expired
 *   transaction. The timeout for this transaction was 5000 ms …
 *
 * 因此这里统一放宽两个上限：
 *  - `maxWait`：等待可用连接的最长时间（池满时排队）
 *  - `timeout`：事务从开始到提交/回滚的总时长上限
 *
 * 所有涉及订单/库存的写操作都应走 `runTx`，不要直接调 `prisma.$transaction`。
 */
export const TX_OPTIONS = {
  maxWait: 20_000,
  timeout: 30_000,
} as const;

/** 在放宽超时的事务中执行 fn */
export function runTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn, TX_OPTIONS);
}
