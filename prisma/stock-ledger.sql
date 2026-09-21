-- ============================================================================
-- 库存台账：append-only 保护 + 一次性数据回填
-- ============================================================================
-- Prisma 无法表达触发器，所以这里手工维护；`prisma db push` 之后如需重建，
-- 执行： node scripts/_apply-stock-ledger.mjs
--
-- ⚠️ 顺序很重要：触发器一旦装上，StockMovement 就**不允许再 UPDATE**，
--    所以必须先跑回填、最后装触发器。本文件可重复执行（幂等）。
-- ============================================================================

-- 0) 先卸掉旧触发器，保证回填不被自己的保护规则拦住
DROP TRIGGER IF EXISTS trg_stock_movement_append_only ON "StockMovement";

-- ---------------------------------------------------------------------------
-- 1) 回填：外购菜品的 stockQty 由 NULL 归位
-- ⚠️ **不能一律置 0**：这些菜品可能已经有台账分录（只是账面字段是 NULL），
--    置 0 会把真实库存抹掉（曾把「矿泉水」从 77 抹成 0，前台立刻变「售罄」、
--    顾客下不了单 —— 因为前台按 `stockQty ?? 0` 算可用量）。
--    正确做法：按台账汇总归位；台账为空才是 0。
-- ---------------------------------------------------------------------------
UPDATE "MenuItem" i
   SET "stockQty" = COALESCE(
         (SELECT SUM(m."quantity") FROM "StockMovement" m WHERE m."itemId" = i."id"),
         0
       )
 WHERE i."stockType" = 'PURCHASED' AND i."stockQty" IS NULL;

-- ---------------------------------------------------------------------------
-- 2) 回填历史分录的单价与金额（用菜品参考成本价 costPrice；历史无价者记 0）
-- ---------------------------------------------------------------------------
UPDATE "StockMovement" m
   SET "unitCost" = COALESCE(i."costPrice", 0),
       "amount"   = ROUND((COALESCE(i."costPrice", 0) * m."quantity")::numeric, 2)
  FROM "MenuItem" i
 WHERE i."id" = m."itemId" AND m."amount" IS NULL;

-- ---------------------------------------------------------------------------
-- 3) 回填历史分录的 balanceAfter（按菜品、按时间顺序做累计）
-- ---------------------------------------------------------------------------
WITH ordered AS (
  SELECT m."id" AS mid,
         SUM(m."quantity") OVER (PARTITION BY m."itemId" ORDER BY m."createdAt", m."id") AS run
    FROM "StockMovement" m
    JOIN "MenuItem" i ON i."id" = m."itemId"
   WHERE i."stockType" = 'PURCHASED'
)
UPDATE "StockMovement" m SET "balanceAfter" = o.run FROM ordered o WHERE o.mid = m.id;

-- ---------------------------------------------------------------------------
-- 4) 初始化金额账（stockValue）与移动加权成本（avgCost）
--    ⚠️ 只做「按当前账面 × 参考成本」的初始化，**不新增分录**；
--       账面与台账不符的菜品不会被抹平，而是留给「账实核对」页由人工决定
--       （按台账重算 / 做一次盘点）。
-- ---------------------------------------------------------------------------
UPDATE "MenuItem"
   SET "avgCost"    = COALESCE("avgCost", COALESCE("costPrice", 0)),
       "stockValue" = ROUND((COALESCE("stockQty", 0) * COALESCE("costPrice", 0))::numeric, 2)
 WHERE "stockType" = 'PURCHASED' AND "stockValue" IS NULL;

-- ---------------------------------------------------------------------------
-- 5) 装回台账保护触发器
--
-- 两条规则：
--   · **UPDATE**：默认拒绝；**唯一例外**是「作废 / 恢复」——即只改
--     voidedAt / voidedBy / voidReason 三个字段，其余业务字段必须原样不变。
--     这样超管的「删除」= 作废（可追溯、可恢复），而金额/数量/方向永远改不了。
--   · **DELETE**：仅在父级 MenuItem 已不存在时放行 —— 这样：
--       · 菜单里正常删菜品（级联删分录）仍然可用
--       · 直接删分录会被拦下（账套必须靠作废而不是抹掉证据）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stock_movement_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- 只允许「作废/恢复」这一种 UPDATE
    IF (NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt"
        OR NEW."voidedBy" IS DISTINCT FROM OLD."voidedBy"
        OR NEW."voidReason" IS DISTINCT FROM OLD."voidReason")
       -- 且除作废字段外，其余字段一律不许变
       AND NEW."itemId"         IS NOT DISTINCT FROM OLD."itemId"
       AND NEW."type"           IS NOT DISTINCT FROM OLD."type"
       AND NEW."quantity"       IS NOT DISTINCT FROM OLD."quantity"
       AND NEW."unitCost"       IS NOT DISTINCT FROM OLD."unitCost"
       AND NEW."amount"         IS NOT DISTINCT FROM OLD."amount"
       AND NEW."balanceAfter"   IS NOT DISTINCT FROM OLD."balanceAfter"
       AND NEW."docType"        IS NOT DISTINCT FROM OLD."docType"
       AND NEW."docId"          IS NOT DISTINCT FROM OLD."docId"
       AND NEW."reversalOf"     IS NOT DISTINCT FROM OLD."reversalOf"
       AND NEW."idempotencyKey" IS NOT DISTINCT FROM OLD."idempotencyKey"
       AND NEW."orderId"        IS NOT DISTINCT FROM OLD."orderId"
       AND NEW."createdAt"      IS NOT DISTINCT FROM OLD."createdAt"
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'StockMovement is an append-only ledger: only the void fields (voidedAt/voidedBy/voidReason) may be updated';
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "MenuItem" WHERE "id" = OLD."itemId") THEN
      RAISE EXCEPTION 'StockMovement is an append-only ledger: DELETE is forbidden while the item exists (void it instead)';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement_append_only
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_append_only();
