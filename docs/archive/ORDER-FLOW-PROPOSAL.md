# 下单结算流程改造 · 方案讨论稿

> 状态：**Phase 1 + Phase 2 已实施（2026-09-20）**，见文末「12. 实施记录」。
> 提出人：顾客/店主要求（2026-09-20）

---

## 1. 需求原文与拆解

| # | 需求 | 拆解出的功能点 |
|---|---|---|
| 1 | 购物车页增加「确认下单」按钮 | 购物车 → 下单（不付款）→ 生成订单 |
| 2 | 按下后后台要显示客户下单的内容 | 后台**新增订单/后厨看板页**（当前后台没有订单页） |
| 3 | 打印到 80mm 热敏打印机，给后台备餐 | 80mm 小票模板 + 打印通道 |
| 4 | 备好送出给客户 | 订单状态：备餐 → 已送出 |
| 5 | 客户称重渔获，超 1 公斤每公斤 60 泰铢，计入总单 | 称重录入 + 计费规则 + 计入订单总额 |
| 6 | 后台打印订单、改金额或打折，再打印订单 + QR 收款 | 改价/折扣 + 重打印 + 绑定额度的 PromptPay QR |
| 7 | 学习其他网站完善流程 | 对照钓场收银 / POS 行业做法 |
| 8 | 讨论后再上线 | 先出方案，再开发 |
| 9 | 检查其他功能是否受影响 | 影响面分析（见第 6 节） |

---

## 2. 现状（已实现的流程）

```
顾客：菜单 → 购物车 → 「结算」→ 选支付方式 → 付款
                              └→ PROMPTPAY：跳转支付页显示二维码
店端：/admin 只有 9 个页签（仪表盘/收款/菜单/库存/报表/餐桌/休息日/预约/交易）
```

**关键现状**
- 购物车的 `handlePay()` **同时做三件事**：建订单 → 建支付单 → 跳转/清空购物车。
  → 目前是**先付款后出餐**（pre-pay）。
- **后台没有任何「订单管理」页面**（`/api/admin/orders` 接口存在，但没有 UI）。
  仪表盘只显示 `pendingOrders` 计数。
- **全站没有任何打印功能**（`window.print` / 热敏 / ESC-POS 都没有）。
- **没有称重 / 渔获概念**（`Order.quantity` 是 `Int`，无小数重量）。
- `/admin/collect`（收款页）是**自由输入金额 → 生成 QR**，与订单**完全无关联**；
  PromptPay 手机号存在浏览器 `localStorage`（每台设备各自配置）。
- 营收口径：`Payment.amount`（交易页/仪表盘）与 `Order.totalPrice`（报表）两套并存。

**订单状态**：`PENDING → PAID → PREPARING → READY → CANCELLED`
（把「是否付款」和「出餐到哪一步」混在同一个枚举里）

---

## 3. 行业做法（调研结论）

钓场/钓虾场收银系统（如「钓多多」「纳客」「渔联网」「自助钓鱼小程序」）普遍是这个闭环：

1. **开竿/入场**（扫码或办卡，绑定钓位与计时）
2. **点餐**（小程序下单 → 后厨出票 → 送到钓位）
3. **回鱼结算**：渔获**称重** → 自动同步重量 → 按鱼种/重量算鱼款
4. **一次结清**：钓费 + 餐费 + 鱼款 − 折扣，**钓费抵扣、鱼款结算一步完成**
5. **出电子小票**，支持微信/支付宝/会员卡/储值金

对我们最有参考价值的两点：
- **「先消费、最后统一结算」是行业默认**，不是先付钱再吃饭。
- **称重设备可对接**（智能电子秤 → 数据自动同步），但我们起步可以**手输重量**。

网页端打印 80mm 小票，业界有 4 种架构（HPRT 归纳）：

| 架构 | 原理 | 优点 | 缺点 |
|---|---|---|---|
| **A. 浏览器打印** | `window.print()` + 80mm CSS | 零安装，任何已装驱动的打印机都能用 | 每次弹打印对话框；拿不到"是否真打出来" |
| **B. 浏览器直连** | WebUSB / Web Serial / Web Bluetooth + ESC/POS | 免弹窗、可切纸/开钱箱 | 要 HTTPS + 每次用户点击授权；机型兼容窄；iPad Safari 不支持 |
| **C. 本地打印代理** | 店里一台电脑跑小程序，轮询打印队列 → ESC/POS | **真·自动打印**、可靠、可回报状态 | 店里要常开一台机器并维护 |
| **D. 云打印** | 云端队列 → 支持云的打印机/网关 | 不依赖店里电脑 | 要买特定型号打印机；断网要有重试与去重 |

> 我们的站点在 Vercel（云），**够不到店里的局域网打印机**，所以"云端直接打印"不成立；
> 想自动打印必须走 **C（本地代理）** 或 **D（云打印机）**。

---

## 4. 建议的目标流程

```
① 点餐下单（顾客）
   购物车 → [确认下单] → 生成订单(status=PENDING) → 进入后厨队列
        ↓
② 后厨备餐（员工）
   80mm 小票打印（订单号/桌号/菜品/备注/时间）
   → 备餐 → 状态 PREPARING → READY → SERVED（已送出）
        ↓
③ 渔获称重（员工）
   录入重量 kg → 规则：超过 1kg 的部分 × 60฿/kg
   → 生成一条「渔获」明细 → 计入 Order.totalPrice
        ↓
④ 结算收款（员工）
   改价 / 折扣（记录原因与操作人）
   → 打印「结算单」+ 金额二维码（PromptPay 动态金额）
   → 客户付款 → Payment(SUCCESSFUL) → 状态 SETTLED
```

**建议的订单状态机**（把付款与出餐拆开）

```
出餐：PENDING → PREPARING → READY → SERVED → SETTLED
付款：Payment.status（PENDING → SUCCESSFUL / FAILED），独立字段
异常：CANCELLED（任一阶段可取消）
```

---

## 5. 数据模型改动（草案）

```prisma
model Order {
  // ...现有字段
  discountAmount  Float?      // 折扣金额（正数=减免）
  discountType    String?     // NONE | PERCENT | AMOUNT
  discountNote    String?     // 原因
  adjustedBy      String?     // 操作人（管理员用户名）
  adjustedAt      DateTime?
  fishWeightKg    Float?      // 渔获总重
  fishCharge      Float?      // 渔获费（已计入 totalPrice）
  settledAt       DateTime?
}

// 渔获称重记录（可多次称重，便于追溯）
model Weighing {
  id          String   @id @default(cuid())
  orderId     String
  weightKg    Float
  includedKg  Float    @default(1)   // 前 1kg 免费额度
  pricePerKg  Float    @default(60)
  amount      Float                   // 应计金额 = max(0, weight-included)*price
  operator    String?
  createdAt   DateTime @default(now())
}

// 打印队列（仅架构 C/D 需要；架构 A 不需要）
model PrintJob {
  id         String   @id @default(cuid())
  orderId    String
  station    String   // KITCHEN | CASHIER
  kind       String   // KITCHEN_TICKET | BILL | RECEIPT
  payload    Json     // 小票渲染数据（冻结快照，避免重打时数据漂移）
  status     String   @default("PENDING")  // PENDING | PRINTED | FAILED
  attempts   Int      @default(0)
  printedAt  DateTime?
  createdAt  DateTime @default(now())
}
```

**金额口径（重要）**
- `Order.subtotal` = 菜品小计 + 渔获费
- `Order.totalPrice` = `subtotal − discountAmount`（**净额**）
- `Payment.amount` = 结算时的 `totalPrice`
- 这样报表（sum `Order.totalPrice`）与交易页（sum `Payment.amount`）**口径自动一致**，无需改动聚合逻辑。

**渔获如何入账（两选一）**
- 方案甲（推荐）：渔获作为**一条合成的 OrderItem**（虚拟菜单项「渔获 / Catch」）。
  好处：菜品维度报表、毛利、库存全部自动覆盖。代价：`OrderItem.quantity` 需从 `Int` 改 `Float`（或存 1 份、单价=金额）。
- 方案乙：只在 `Order` 上加 `fishWeightKg/fishCharge` 字段，独立展示。
  好处：不动 OrderItem。代价：菜品报表看不到渔获这一行。

---

## 6. 影响面分析（其他功能会不会被影响）

| 模块 | 是否受影响 | 说明 |
|---|---|---|
| **购物车** | 🔴 改 | 主按钮从「结算」改为「确认下单」；付款入口移到店端结算 |
| **支付页 / PromptPay** | 🟡 小改 | 现有 `createPayment(orderId, amount)` 可复用；改为结算时创建，金额为最终净额 |
| **订单页（顾客）** | 🟡 小改 | 新增状态文案（已送出/待结算/已结算）三语 |
| **后台收款页 collect** | 🔴 改 | 从"自由输金额"改为"选订单 → 带出金额"（保留自由输入作为临时收款兜底） |
| **后台（新增订单看板）** | 🟢 新增 | 目前无订单页，需新建 |
| **后台仪表盘 stats** | 🟡 小改 | `todayRevenue` 基于 Payment，口径不变；`pendingOrders` 语义要重定义 |
| **交易页 transactions** | 🟢 不变 | 基于 Payment，口径一致 |
| **报表 reports** | 🟡 小改 | 汇总 `Order.totalPrice`，因已改为净额，需确认"折扣后"口径；建议**另加"折扣总额"指标** |
| **库存 stock** | 🟡 注意 | 下单即扣库存（现状）；若订单可取消/改价，需确认回补链路（已有 CANCEL 回补） |
| **LINE 日报** | 🟡 小改 | 若日报含订单数/营收，口径随 `totalPrice` 变化 |
| **i18n（中/英/泰）** | 🔴 必做 | 新增约 40-60 个 key × 3 语言，且必须跑 `check:i18n` 核验 |
| **餐桌二维码点餐** | 🟢 不变 | 桌号流程保留，作为订单归属 |

---

## 7. 分阶段落地建议

- **Phase 1（先跑起来）**：① 确认下单按钮 + ② 后台订单看板 + ③ 80mm 打印用**架构 A**（浏览器打印，零安装）
- **Phase 2（计费闭环）**：④ 渔获称重 + ⑤ 改价/折扣 + ⑥ 结算单 + QR
- **Phase 3（体验优化）**：⑦ 自动打印（架构 C 本地代理 或 D 云打印机）+ ⑧ 订单状态推送

---

## 8. 已确认决策（2026-09-20 与店主对齐）

| # | 决策 | 结论 | 影响 |
|---|---|---|---|
| 1 | 结算模式 | **两种都支持** —— 顾客下单时可自选「立即付款」或「最后结算」 | 订单需带结算方式字段；两条分支都要覆盖 |
| 2 | 打印方案 | **浏览器打印**（架构 A）。后台点「打印」→ 出到**系统默认打印机** | 零安装；需 80mm 打印样式 + 免弹窗设置 |
| 3 | 渔获计费 | **前 1kg 免费，超出部分 60฿/kg** | `amount = max(0, weight − 1) × 60` |
| 4 | 改价方式 | **折扣为主 + 小额改价**（超出上限需管理员） | 需折扣字段 + 改价上限配置 |

### 关于「打印到默认打印机」的技术说明
- 普通 Chrome 下 `window.print()` 会弹打印对话框，**默认打印机已预选**，按回车即可；
- 想**完全免弹窗**（按一下就出纸），用这个快捷方式启动 Chrome：
  `chrome.exe --kiosk-printing`（可做成桌面快捷方式，店里收银那台固定用它开）；
- 打印样式：`@page { size: 80mm auto; margin: 0 }` + `@media print` 专用布局（隐藏页头/导航/按钮）。

### 顾客端两条分支
```
购物车 → [确认下单] → 生成订单 + 显示「下单成功 / 订单内容」
                          ├─ [立即付款]  → 选支付方式 → 付款 → SETTLED
                          └─ [最后结算]  → 订单进后厨 → … → 最后统一结清
```

---

## 9. 剩余决策（已确认）

| # | 问题 | 结论 |
|---|---|---|
| 5 | 外带怎么结算 | **外带也能后付** —— 与堂食统一逻辑，顾客自选 |
| 6 | 库存何时扣 | **结算时才扣** |
| 7 | 打印免弹窗 | **要免弹窗，一键出纸**（`chrome --kiosk-printing`） |
| 8 | 小额改价上限 | **±10%** 以内店员可直接改，超出需管理员 |

---

## 10. ⚠️ 库存「结算时才扣」的风险与建议

店主选了「结算时才扣」。这带来一个**真实风险**：

> 两份订单同时点了**最后 1 份**限量菜。下单时都不扣、都能成功；
> 到结账时才发现只剩 1 份 → 第二桌已经吃上了，账却结不了。

**建议改成「预占 + 确认」两段式**（对顾客和店员都是透明的）：

```
下单   → 校验可用量（实物 − 已预占）不足则直接拦下 → 记「预占」不写流水
备餐   → 预占保持
结算   → 正式扣减（写 StockMovement SALE）
取消   → 释放预占
```

- 对**不管理的菜品（stockType=NONE）**：完全无影响；
- 对**限量菜/外购库存**：既避免超卖，又不违反"结算才真正扣账"的意图；
- 实现上只需在 `OrderItem` 加一个 `reservedQty`（或建 `StockReservation` 表），
  `availableQty = stockQty − Σ未结算预占`。

> 若店主认为店小、并发低，也可以先不做预占，直接"结算才扣"。
> **但请明确选一个**——这决定要不要建预留表。

---

## 11. 实施计划（确认后开工）

### 数据层（`prisma/schema.prisma`）
- `OrderStatus` 扩展：`PENDING → PREPARING → READY → SERVED → SETTLED`（拆开付款与出餐）
- `Order` 新增：`settlementMode`(PREPAID|POSTPAID) / `discountType` / `discountAmount` /
  `discountNote` / `adjustedBy` / `adjustedAt` / `fishWeightKg` / `fishCharge` / `settledAt`
- 新增 `Weighing`（称重记录，可多次）
- 新增 `StockReservation`（若采纳预占方案）

### 后端
- `POST /api/orders`：支持 `settlementMode`；后付不建支付单
- `PATCH /api/admin/orders/[id]`：扩展为支持状态流转 / 折扣 / 改价 / 称重 / 结算
- `POST /api/admin/orders/[id]/settle`：生成最终金额 + PromptPay QR
- 收款页 `collect` 改为「选订单 → 带出金额」（保留自由输入兜底）

### 前端
- 顾客：购物车加「确认下单」+ 下单成功页（显示订单内容）+ 支付/后付二选一
- 后台：**新增「订单」页**（当前完全没有）：订单列表 / 后厨出票 / 状态流转 / 称重 / 折扣 / 结算出 QR
- 打印：`PrintTicket` 组件（80mm 样式）+ `usePrint()` hook

### 质量门（沿用现有流程）
- `tsc --noEmit` 零错误 → `next build` 通过 → 端到端测试
- `npm run check:i18n`（三语 key 对齐 + 语言核验）→ 新增约 40-60 key × 3 语言
- 部署后跑 `check:i18n:live` + 线上 smoke

### 分期
- **Phase 1**：确认下单 + 后台订单页 + 80mm 打印
- **Phase 2**：称重计费 + 折扣/改价 + 结算出 QR
- **Phase 3**：库存预占 + 免弹窗打印配置 + 订单状态细粒度

---

## 12. 实施记录（Phase 1 + Phase 2 同时上线）

### 店主最终确认
| # | 决策 | 结论 |
|---|---|---|
| 库存 | **确认订单后即可预占**；后台改单**减少**时把库存加回去 | 采用「预占（下单）→ 转正（结算/付款）→ 释放（取消/减量）」三态 |
| 上线 | **Phase 1 + Phase 2 同时上线** | 一次交付完整闭环 |

### 已落地的状态机
```
出餐：PENDING → PREPARING → READY → SERVED        （后厨流程）
结算：SETTLED                                      （账单结清，终态）
异常：CANCELLED（结清后不可取消）
遗留：PAID（旧数据保留，新流程不再写入）
付款与出餐从此解耦 —— 付款状态一律看 Payment.status
```

### 金额口径（已实现）
```
subtotal        = Σ OrderItem.totalPrice                     （菜品小计）
fishCharge      = max(0, 渔获总重kg − 1) × 60                （前 1kg 免费）
discountAmount  = PERCENT: gross×p% ｜ AMOUNT: min(金额, gross)
totalPrice      = subtotal + fishCharge − discountAmount      （应付净额）
```
- 报表 `SUM(Order.totalPrice)` 与交易页 `SUM(Payment.amount)` 口径一致；
- 报表概览新增 `fishRevenue` / `fishWeightKg` / `discountTotal` 三项；
- LINE 日报在有渔获/折扣时多打两行。

### 库存三态（`src/lib/stock.ts`）
| 时点 | PURCHASED | MADE |
|---|---|---|
| 下单（预占） | `OrderItem.reservedQty = qty`，**不动 stockQty、不写流水** | 数量天然计入当日占用，无需额外字段 |
| 结算 / 先付到账（转正） | `stockQty −= reservedQty`，写 `SALE` 流水，`reservedQty=0` | 仅写 `SALE` 流水备查 |
| 取消 / 减量（释放） | 预占部分直接释放；**已扣减部分回补并写 `CANCEL` 流水** | 订单转 CANCELLED 后自动不计入占用 |

- 可用量：PURCHASED = `stockQty − Σ未结清预占`；MADE = `dailyLimit − 当日非取消件数`
- 历史订单（旧流程「下单即扣」）`reservedQty = 0`，`quantity − reservedQty` 表达式天然兼容，取消时仍能正确回补
- 并发用 `SELECT … FOR UPDATE` 对 `MenuItem` 行加锁串行化，不会超卖

### 新增/改动的接口
| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/orders` | 确认下单（预占 + `settlementMode`），订单号撞号自动重试 |
| GET | `/api/orders/[id]` | 顾客订单详情 |
| PATCH | `/api/admin/orders/[id]` | `action: status \\| items \\| discount \\| cancel`；省略 action 则兼容旧的改桌 |
| POST/DELETE | `/api/admin/orders/[id]/weigh` | 录入 / 撤销渔获称重 |
| POST | `/api/admin/orders/[id]/settle` | `action: create \\| confirm \\| mark-paid`，`method: CASH \\| PROMPTPAY` |
| GET | `/api/admin/orders` | `scope=open \\| awaiting \\| today` + `summary` |
| GET | `/api/admin/stats` | 新增 `awaitingSettlementCount/Amount`、`todayFish*`、`todayDiscount` |

### 80mm 打印（架构 A：浏览器打印）
- `src/lib/print-receipt.ts`：三张票 —— 后厨单（无价格、菜品放大）/ 预结单（含渔获、折扣、收款二维码）/ 收款收据（PAID 印章）
- 打印走**隐藏 iframe**（不弹新窗、不会被拦截），`@page { size: 80mm auto; margin: 0 }`
- 免弹窗：店里收银机用 `chrome.exe --kiosk-printing` 启动快捷方式即可一键出纸

### 改价权限
- 减免额 ≤ 毛额 10%：店员直接改（`STAFF_DISCOUNT_LIMIT_RATIO`）
- 超出：服务端返回 `403 + code=NEEDS_ADMIN`，前端弹出管理员密码，`bcrypt.compare` 校验当前登录管理员密码后放行
- 任何折扣都必须填原因，并记录 `adjustedBy` / `adjustedAt`，报表可对账

### 界面
- 顾客：购物车新增「结算方式（最后结算 / 立即付款）」+「确认下单」；下单成功跳 `/orders/[id]` 展示下单内容与进度
- 后台：新增「🧾 订单」页签 —— 订单看板 / 后厨出票 / 状态流转 / 改单 / 称重 / 折扣 / 结算出码 / 打印收据 / 取消
- 收款页：新增「待结算订单」区，选中即带出金额并绑定订单，收款后一键结清（保留自由输入兜底）
- 仪表盘：新增「待收款」提醒条，`进行中订单` 口径改为未结清未取消



