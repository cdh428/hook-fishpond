-- 收款流水表（2026-10-17）
-- 背景：一单可多次点单、多次付款。原 Order.prepaidAmount 只是一个覆盖式汇总数，
--       无法回答「几点、谁、用什么方式、收了多少」，做不了对账。
--       改为独立流水表：只追加不覆盖，改错靠 voidedAt 作废或追加负数 REFUND。
-- 幂等：可重复执行。

-- 枚举要先建，否则建表时引用不到。注意 DDL 里用 PaymentKind 类型而非字符串默认值。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentKind') THEN
    CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'PARTIAL', 'FINAL', 'REFUND');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PaymentRecord" (
  "id"        TEXT PRIMARY KEY,
  "orderId"   TEXT NOT NULL,
  "amount"    DOUBLE PRECISION NOT NULL,
  "method"    "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "kind"      "PaymentKind" NOT NULL DEFAULT 'PARTIAL',
  "operator"  TEXT,
  "note"      TEXT,
  "paidAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt"  TIMESTAMP(3),
  "voidedBy"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentRecord_orderId_fkey'
  ) THEN
    ALTER TABLE "PaymentRecord"
      ADD CONSTRAINT "PaymentRecord_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PaymentRecord_orderId_paidAt_idx"
  ON "PaymentRecord"("orderId", "paidAt");
CREATE INDEX IF NOT EXISTS "PaymentRecord_paidAt_idx"
  ON "PaymentRecord"("paidAt");

-- 存量回填：已经记过的 prepaidAmount 补一条流水，否则新逻辑（从流水求和）会把已付清零。
-- FP-20261017-006 就是这种情况（现金预付 160）。用 note 标记为回填，便于审计。
INSERT INTO "PaymentRecord" ("id", "orderId", "amount", "method", "kind", "operator", "note", "paidAt")
SELECT
  'backfill_' || o."id",
  o."id",
  o."prepaidAmount",
  'CASH'::"PaymentMethod",
  'DEPOSIT'::"PaymentKind",
  'system',
  COALESCE(o."prepaidNote", '存量回填：由 Order.prepaidAmount 迁移'),
  o."createdAt"
FROM "Order" o
WHERE o."prepaidAmount" > 0
  AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" r WHERE r."orderId" = o."id");
