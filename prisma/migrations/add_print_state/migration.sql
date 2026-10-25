-- 出单状态改三元（2026-10-25）
-- 背景：原来只有 autoPrintFired 一个布尔。
--   ① 自动出票失败（桥没开 / 打印机离线）时置位没发生 → 下一轮又试，但用户看不出"没打出来"；
--   ② 刷新页面后既是"已打过"又要"提示有新单"，一个布尔表达不了三种状态。
-- 改为：
--   PRINTED  已出票（自动或手动）→ 永不再自动出票
--   FAILED   出票失败（打印机不可用）→ 不再自动重试，页面挂「未打印」角标，等人工手动补打
--   (null)   从未尝试过 → 满足值守时刻条件时自动出票
-- 幂等：可重复执行。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrintState') THEN
    CREATE TYPE "PrintState" AS ENUM ('PRINTED', 'FAILED');
  END IF;
END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "printState" "PrintState";
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "printError" TEXT;

-- 存量回填：原来 autoPrintFired=true 的就是"已出票"，把时间点补成最后一次变动时间（近似值）
UPDATE "Order"
SET "printState" = 'PRINTED'::"PrintState",
    "printedAt" = COALESCE("printedAt", "updatedAt")
WHERE "autoPrintFired" = true
  AND "printState" IS NULL;

CREATE INDEX IF NOT EXISTS "Order_printState_idx" ON "Order"("printState");
