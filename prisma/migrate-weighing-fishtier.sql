-- Weighing.fishTier: 鱼种价格档（50/60/80/100 ฿/kg），NULL = 按兜底 60
ALTER TABLE "Weighing" ADD COLUMN "fishTier" INTEGER;

-- 索引：按订单查称重记录时顺带按 fishTier 分组（便于报表）
CREATE INDEX IF NOT EXISTS "Weighing_orderId_fishTier_idx" ON "Weighing"("orderId", "fishTier");
