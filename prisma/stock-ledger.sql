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
-- 1) 回填：外购菜品的 stockQty 由 NULL 归一为 0（NULL 与 0 业务上等价，
--    但 NULL 会让展示层出现「—」与「0 件」两种写法）
-- ---------------------------------------------------------------------------
UPDATE "MenuItem"
   SET "stockQty" = 0
 WHERE "stockType" = 'PURCHASED' AND "stockQty" IS NULL;

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
-- 5) 装回不可变台账触发器
--    UPDATE 一律拒绝（改错必须走「红字冲销」：新增反向分录 + reversalOf 指针）
--    DELETE 仅在父级 MenuItem 已不存在时放行 —— 这样：
--      · 菜单里正常删菜品（级联删分录）仍然可用
--      · 直接删分录会被拦下
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stock_movement_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'StockMovement is an append-only ledger: UPDATE is forbidden (post a reversing entry instead)';
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "MenuItem" WHERE "id" = OLD."itemId") THEN
      RAISE EXCEPTION 'StockMovement is an append-only ledger: DELETE is forbidden while the item exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement_append_only
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_append_only();
