# 库存/进销存 —— 开源对标报告与采纳决策

> 调研日期 2026-09-21 ｜ 团队 `stock-acct-squad`（3 名并行研究员）
> 目的：为 hook-fishpond 小店找到「销售 / 进货 / 库存」符合会计准则的开源实现，对照后改写。
> 证据等级：✅ 本次读到源码/文档 ｜ ⚠️ 公开稳定实现但本次未逐行取证（被限流）

---

## 一、候选对比

| 项目 | 栈 | License | 相关度 | 最值得抄的点 | 证据 |
|---|---|---|---|---|---|
| **ERPNext** | Python/Frappe | GPLv3 | 高 | `Stock Ledger Entry` 原子流水 + reposting 重算移动加权价；**Opening Stock 独立凭证**；取消=Cancel 红冲，永不删除 | ⚠️ 结构稳定 |
| **jshERP（华夏ERP）** | Java/SpringBoot | 开源(商用授权) | 高 | 中文进销存口径；**期初库存独立单据 + `isInit` 标记**；删除带关联校验；`is_delete` 软删 | ⚠️ 结构稳定 |
| **InvenTree** | Python/Django | MIT | 中 | `StockItemTracking` 全量留痕；`MinValueValidator(0)`+`lock_quantity()` 行锁防超卖；销毁=状态标记非物理删 | ✅ 已读 `stock/models.py` |
| **opensourcepos** | PHP/CodeIgniter | MIT | 高 | 销售保存阶段扣减，事务内**原子 upsert**（`quantity + delta`）防漏扣；纠错=插**带原因的补偿流水**，**无删流水路径** | ✅ 已读 `Sale.php`/`Item_quantity.php`/`Inventory.php` |
| **Grocy** | PHP/SQLite | MIT | 中 | `stock_log` 只追加；**库存 = 流水聚合（视图）**，天然不漏扣不超卖；纠正=带原因新流水 | ⚠️ DDL 未取证 |
| **LedgerSMB** | Perl/PG | GPL | 最高 | 凭证生命周期最完整：**Close books 锁期** + `Enforce transaction reversal`（过账后禁改删，只能 void）+ 触发器审计 | ✅ 文档/SQL |
| **Akaunting** | PHP/Laravel | GPL | 高 | 小商户导向：Void Transaction 作废 + 软删 `deleted_at`；已对账交易须先取消对账才能动 | ✅ 文档 |
| **Bigcapital** | TS/NestJS | AGPL-3.0 | 高 | 存货变动自动生成底层复式分录（存货 ↔ 损益联动），FIFO + 平均成本 | ✅ 文档 |

---

## 二、三个核心问题的结论

### ① 计价与「存货核算」模块
- **共性**：都靠一张**独立流水表**做单一真相（ERPNext `stock_ledger_entry`、Grocy `stock`、opensourcepos `inventory`、InvenTree `StockItemTracking`），当前量是流水聚合或由流水维护的快照。
- **我们现状**：`StockMovement` 已是独立流水 + 快照余额（`stockQty`/`stockValue`），移动加权平均 ✅ **方向正确，无需换血**。
- **差异**：专业软件还有一层 **GL 复式分录**把「存货 ↔ 成本/损益」联动（Bigcapital/LedgerSMB）。我们只在库存内部成对记账，没有 P&L 侧。
  → **决策：不引入 GL**。小店不做三张报表，收益 < 复杂度。

### ② 期初建账 / 第一次平账（← 本次问题根因）
- **ERPNext**：期初是**独立凭证**（`is_opening=1`），显式区别于日常进出库。
- **jshERP**：期初独立单据 + `isInit` 标记，**不参与后续加权**；并由 `isManage`（是否管理）字段控制，改管理状态时**强制校验期初重录**。
- **关键洞察**：两家都把期初**当作一类有身份、可被单独特判与撤销的凭证**，而不是「一条普通手工调整」。
- **我们的缺陷**：`recalcStock()` 生成期初时把它写成 `type=MANUAL`、`docType=OPENING` 的普通分录，且**原样信任当时账面数**——如果账面数本身是随手录的错数，这条期初就把错数**固化成台账**，此后账实核对显示"已平"，但两边一起错。
  → **决策：采纳「期初是一等公民」**：期初分录可被识别、可被整体撤销重录；且**录入期初必须走独立入口 + 留原因**，禁止再靠 recalc 静默补录。

### ③ 超管纠错 / 删除记录（← 本次需求）
四种做法的行业分布：

| 方案 | 谁在用 | 优点 | 缺点 |
|---|---|---|---|
| A 物理删除 | jshERP（带关联校验）；**ERPNext/LedgerSMB/InvenTree/Grocy 明确不做** | 快 | 破坏审计链、不可逆、误操作即丢账 |
| B 软删/作废标记 | jshERP `is_delete`、Akaunting `deleted_at` | 保留原件可追溯 | 所有统计查询都要过滤作废行 |
| C 红字冲销 | ERPNext `Cancel`、LedgerSMB `void`、Grocy 补偿流水、opensourcepos 补偿流水 | 会计标准、完全可逆、审计最干净 | 流水条数变多；需保证配对 |
| D 撤销期初重录 | jshERP 反审核 + 期初重录 | 直击「期初致差异」 | 仅适用于期初类 |

**三家研究员的一致推荐（含明确反对项）**：
- `acct-researcher`：**「全盘照搬专业会计的不可变+强制红冲」对本场景过重**——红冲要求老板懂借贷并补一对凭证，非会计极易错。
- `pos-researcher`：**物理删除"绝对不做"**；推荐 **C 红冲 + B 作废标记兜底 + D 专治期初**。
- `erp-researcher`：jshERP 四机制并存，但**ERPNext 的"永不删除、只 Cancel"是更干净的设计**。

---

## 三、我们的采纳决策

**保留**：独立流水表 + 快照余额 + 移动加权平均（与全行业一致，已达标）。

**改造三项**：

1. **超管可「作废」任一分录 → 从账上移除、可恢复、带审计**（采纳 B，UI 文案叫「删除」，行为是作废）
   - `StockMovement` 增 `voidedAt / voidedBy / voidReason`
   - 触发器放开**唯一**一种 UPDATE：只允许改这三个作废字段，其余字段仍禁止修改
   - **余额 = Σ{未作废 且 balanceAfter 非空} 的分录** —— 把这个定义收敛成**唯一常量**，杜绝"漏改某个查询导致账漂"
   - 作废后**立即重算**该菜品账面 → 天然账平
   - 每次操作写 `StockLedgerAudit`（谁/何时/哪条/原因/前后快照）

2. **期初升级为一等凭证**：可整体撤销重录；`recalcStock` 不再静默把账面数固化成期初。

3. **权限**：`requireSuperAdmin` 收口所有破坏性操作（重算/冲销/作废），普通 MANAGER 只读 + 日常进货盘点。

**明确不采纳**：物理删除（A）、完整 GL 复式分录、期末结账锁期（简化为可选"日结锁"，暂不做）。

---

## 四、实施清单

- [x] `requireSuperAdmin()` 鉴权，重算/冲销收归超管
- [ ] `prisma/schema.prisma`：`StockMovement` + `voidedAt/voidedBy/voidReason`；新增 `StockLedgerAudit`
- [ ] `prisma/stock-ledger.sql`：触发器放开「仅作废字段可 UPDATE」
- [ ] `src/lib/stock-ledger.ts`：`LIVE_MOVEMENT` 谓词 + `recomputeItemBalance()` + `voidMovement()/unvoidMovement()`
- [ ] 收敛所有聚合口径（reconcile / recalc / 明细页 / 挂钩体检 / 结算补记）过滤已作废
- [ ] API：`POST /api/admin/stock/[itemId]` 增 `action: void | unvoid`（仅超管）
- [ ] 前端：明细分录行「作废 / 恢复」按钮 + 原因输入
- [ ] 回归：作废后 `账面 = Σ未作废分录` 断言
