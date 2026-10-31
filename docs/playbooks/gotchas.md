# 踩坑手册（Gotchas）

> 目的：**同一个坑不要踩第二次。**
> 每条都写清「现象 → 根因 → 正确做法」，全部是真实踩过的，不是假设。
>
> 相关文档：
> - 推送与验证 → [`push-checklist.md`](push-checklist.md)
> - 部署与备份 → [`deploy-and-backup.md`](deploy-and-backup.md)
> - 密钥处理 → [`secrets-handling.md`](secrets-handling.md)

---

## 一、国际化 / 泰文

### 1.1 泰文不能靠模型「生成」，必须用原文 ✅ 最重要

- **现象**：页面上泰文看着是泰文，但母语者一眼看出声调符号被换掉、元音丢了。
  实例：`ประกาศปร้บราคาและการใหบรการ`（正确 `ประกาศปรับราคาและการให้บริการ`）、
  `ปลาซวย`（正确 `ปลาสวาย`）、`ส่วนฟร`（正确 `ส่วนฟรี`）。
- **根因**：模型生成的泰文会系统性丢失 / 替换声调符号与元音。
  **从用户或现场公告直接复制的泰文则完好** —— 差别就在「来源」。
- **正确做法**：
  1. 泰文一律以**用户提供的原文**为准，不要自己「翻译成泰文」。
  2 新增泰文 key 时，优先复用公告原文里已出现的词句。
  3. 提交前**人工过一遍**：用 Grep / Read 看泰文（它们返回正常 UTF-8）。
- ⚠️ `node scripts/check-i18n.mjs` **只校验三语键对齐，查不出拼写**，不要以为它过了就没问题。

### 1.1a 「故意三语同显」的 key 是设计，不是串味 bug —— check:i18n 的串味报警要豁免

- **现象**：`check:i18n` 第 2 层「语言内容」报「串味」：某 key 在 zh/en/th 三个值里都含三种语言的字符。
  实例：`admin.areaHut` = `茅草屋 / Cottage / กระท่อม`、`admin.areaCafe` = `大厅桌位 / Table / โต๊ะ`。
- **根因（故意）**：这些 key 是「区域标签」，**同一格要同时给中/英/泰三类员工看**，
  所以值就是三语并列——这是产品决定，不是漏改。
- **正确做法**：
  1. **不要**按「串味」把这类 key 拆成单语值（拆了反而破坏「同显三语」的设计意图）。
  2. 遇到这类 key，`check:i18n` 报的串味报警**直接跳过**，不算待修项。
  3. 已确认的「故意三语同显」key 名单（新增请追加在此）：
     - `admin.areaHut`（茅草屋区域）
     - `admin.areaCafe`（大厅桌位区域）
- ⚠️ 仅对**明确标注过"故意三语同显"**的 key 豁免；其它 key 出现串味仍是漏改，要修。

### 1.2 改泰文用脚本，别用文本编辑器工具

- **现象**：直接对含泰文的行做精确替换，容易匹配失败（声调符号的码点组合不一致）。
- **正确做法**：用 Python + `json` 模块按 **key 定位**改，`ensure_ascii=False` 写回，写完 `json.loads` 复验。
  改完用 Bash 核对时**只看行数 / 字节数**，别看内容（Bash 输出中文泰文会乱码，见 4.4）。

---

## 二、图片 / 前端渲染

### 2.1 图片不要用「SSR 隐藏 + onLoad 显示」

- **现象**：图片文件已上传、CDN 访问 200、页面 HTML 里也有 `<img>`，但**页面上就是看不到**。
  查看 SSR 产出的标签：`<img src="..." style="display:none"/>`。
- **根因**：SSR 吐出的 HTML 本身就是隐藏的；而 `onLoad` 存在**竞态** ——
  图片在 React hydration 绑定事件之前就加载完成（缓存命中时必然如此），事件不触发，
  于是图**永久**停在 `display:none`。
- **正确做法**：**直接正常渲染** `<img>`。要懒加载就加 `loading="lazy"`；
  要占位就用 CSS 背景。**不要把可见性交给 `onLoad`。**
- **排查手法**：
  ```bash
  curl -s https://www.hookfishpond.com/zh | grep -o '<img[^>]*notice[^>]*>'
  ```
  一眼就能看出 SSR 出的标签有没有 `display:none`。

### 2.2 `'use client'` 不会出现在 SSR 产出的 HTML 里

- **坑**：想判断某个页面是不是客户端组件，去抓线上 HTML 搜 `use client`，搜不到就以为它是服务端组件 —— **结论是错的**。
- **正确做法**：直接看源码文件头部有没有 `'use client'`。

---

## 三、业务逻辑（改之前务必看）

### 3.1 未结清单据**绝不能**按日期过滤

- **现象**：昨天开的桌、没结账，第二天在后台订单页**消失了**，钱收不到也结不掉。
- **根因**：订单页默认 `todayOnly = true`，且该开关**对「进行中」标签页也生效**，
  请求 `scope=today`（曼谷当天）→ 跨天未结的单被过滤掉。
- **正确做法**：「进行中 / 待收款」用 `scope=unsettled`（`status notIn [SETTLED, CANCELLED]`，**不加日期限制**）；
  只有「已结清 / 已取消」才按日期筛。见 `src/app/api/admin/orders/route.ts`。

### 3.2 称重是「5 行制」，免重是**限额行**不是全局抵扣

- **规则**：第 1 行 = 免重（`fishTier = 0`，只记录、**不计费**，累计不得超过总免重）；
  第 2–5 行 = 50 / 60 / 80 / 100 ฿ 四档，每行「公斤数 × 档价」，**此处不再扣免重**；
  渔获费 = 四档金额加总。
- **踩过的错**：一开始写成「总重 ≤ 免重 → 0，否则全部按档价」（全局抵扣）—— 被否掉，重做。
- **免重额度** = 总杆数 × 1 kg；超出时提示「拿出一条鱼」。

### 3.3 鱼竿识别**只按菜单项名称**，不能按价格

- **根因**：100 / 150 这两个价格**不唯一**（烤虾 150、鱿鱼 100），按价格判断会误判。
- **正确做法**：走 `src/lib/orders.ts` 的 `isRodItem()` / `countRodsFromItems()` 三语名称表。
- 另注：同一桌可以**同时**有自带竿（100）和租竿（150），不是二选一。

### 3.4 恢复已取消订单：**状态、预占、回补**三件事必须一起做

- **现象**：后台误点了「取消」，订单从列表里消失；即便把 `status` 改回 `PENDING`，
  菜品也不占库存了，可能出现**超卖**。
- **根因**：`releaseOrderStock()` 取消时做了两件事 —— `reservedQty` 归零、
  对「已扣减部分」写 `CANCEL` 流水回补。只改 `status` 等于两件都没逆回来。
- **可用量口径**：`stockQty − Σ(其他未取消订单的 reservedQty)`。预占为 0 →
  这桌的菜不占位，别桌可以把它卖掉。
- **正确做法**：`restoreOrderStock()`（`src/lib/stock.ts`），三步：
  1. 按「菜品 + 选项键」逐行把 `reservedQty` 写回数量（库存按**菜品**汇总校验，
     预占必须**逐行**写 —— 同菜品多行时按菜品写会翻倍）；
  2. 冲销取消写的 `CANCEL` 分录（置 `voidedAt`），再补一条 `SALE` 把库存扣回去
     —— 保留完整来龙去脉，不要直接删分录；
  3. `stockConsumedAt = null` —— 否则结算时被幂等守卫跳过 → **漏扣库存**。
- **拒绝方式**：库存不足时**整单拒绝**（抛 `InsufficientStockError` → 400），
  不做「部分恢复」。路由动作：`PATCH { action: "restore", status }`，仅对 `CANCELLED` 生效。
- ⚠️ 取消接口对 `CANCELLED` / `SETTLED` 一律返回 `Order is already closed`，
  所以**恢复不能复用 `status` 动作**，必须是独立动作。

### 3.5 误删订单时先查「是软删还是物理删」

- 本项目的「删除」= 改 `status = CANCELLED`，**数据一行不丢**，不必去翻备份。
- 排查顺序：① 查订单是否还在、状态是什么 → ② 查 `StockMovement` 有没有 `CANCEL`
  分录（判断是否真回补过库存）→ ③ 查 `reservedQty` 是否被清零。
- 若「无任何流水 + `reservedQty` 全 0」= 下单只预占、未扣减，恢复时**不用回补**，只需重建预占。

### 3.6 「算钱」的字段有多条路由时，全库先数有几条再改

**现象**：顾客端扫到「总额」码、后台扫到「差额」码，同一张单两个金额。

**根因**：PromptPay 收款码有**三条**路由各自生成、金额口径不一致——
`POST /api/payments`（顾客下单）用 `order.totalPrice`（总额）；
`GET /api/payments/[id]`（顾客支付页轮询）跟着前者；
`POST /api/admin/orders/[id]/settle`（后台收银）才用 `remaining`（需付差额，对）。
三条各算各的，就必然打架。

**改之前必做**：
1. `grep -rn "generatePromptPayQR\|<算钱函数>" src/app/api` 数清**有几条**路由在算这个钱；
2. 逐条看它取的是「总额」还是「差额」，确认哪条是基准（通常是带 `sumCollected`/`prepaid` 的那条）；
3. 把所有入口统一成**同一个 lib 函数**（本项目基准是 `remaining = max(0, totalPrice − sumCollected)`），
   别让每条路由各写一份 `totalPrice − prepaid` 的算术——将来口径一改就漏。

**别做的**：
- **别物理删路由「收敛成一条」**——先分清鉴权边界：顾客端 `POST/GET /api/payments` 是**公开无鉴权**接口，
  后台 `settle` 是 `requireAdmin`。权限模型不同，删了顾客端就瘫。要收敛的是**算法**，不是**入口数**。
- 改完必查：库存会不会双扣（本项目 `consumeReservation` 有 `stockConsumedAt` 幂等，不会）；
  日报/对账营收口径是不是 `SUM(Order.totalPrice)`（是则不受差额改动影响，但 `Payment.amount` 会变差额）。

**通用教训（跨项目）**：凡是「金额/库存/数量」这类要跨页面一致的字段，
多入口（多路由/多组件）最容易各算各的。改动前先**全库搜一遍有几条入口**，统一到一个函数，
别假设「应该只有一处」。

### 3.7 改「收款金额口径」会砸到仪表盘/报表营收——改前先跑影响面扫描

**现象**：顾客付完款，仪表盘「今日收款」数字不对/不更新。

**根因**：仪表盘 `todayRevenue` 原来查 `SUM(Payment.amount)`。而 §3.6 修复把
`Payment.amount` 从「订单总额」改成了「本次补差额 remaining」——**语义变了**，
但仪表盘没跟着改，于是「今日实收」查出来的是"补差那一笔"，漏掉了早先收到的部分付款。

**正确口径**：
- **今日进入收款 = Σ 当天有效 `PaymentRecord`（现金流实收，含部分付款早先收的）**
- **进行中订单待收 = Σ 未结清单的需付差额（totalPrice − 已付流水）**
- **今日预计收入 = 进入收款 + 进行中待收**
- `Payment.amount` 现在存的是差额，**别再用它算营收**；流水表 `PaymentRecord` 才是钱何时以何方式实收的唯一真相。

**改这类东西前的铁律**：跑 `node scripts/scan-impact.mjs <字段>` 把关联点全扫出来，
逐条判断（路由/前端/报表/schema），**别改一处就推**。特别留意"字面不重名但同笔钱"的报表统计。
（跨项目版见 skill `impact-analysis-before-edit`。）

### 3.8 「待结算订单」不能按结算方式过滤，要按「有没有未付余额」

**现象**：顾客预付了一部分（现金 160），但还没称重、没结清，订单 **从收款台消失了**。
店员看不到这张单，就永远收不到尾款。用户原话：「待结算订单只有完全没付款的单子，没有已经预付部分款的」。

**根因**：`GET /api/admin/orders?scope=awaiting` 写的是
`where.settlementMode = "POSTPAID"` —— **只取后付单**。
先付（`PREPAID`）单一旦付过一部分，既不在"待收款"，也没结清，就掉进了逻辑缝里。

**正确口径**：
- **待结算 = 所有「未结清」的单**（`status notIn [SETTLED, CANCELLED]`），**不分先付后付**。
- 前端再按「有没有已收」分组：**已付未结清** 排前面（这些收过钱、最容易被忘），**未付款** 排后面。
- 看板顶部「待收金额」必须按 **Σ 需付差额** 算，不能按 `Σ totalPrice` —— 否则已付部分被重复统计。
- 另需单独给出「已收合计」，让店长一眼看到"手上已经收了多少钱还没结单"。

**防再犯**：凡是「未结清/待收款/挂账」类查询，**先问一句「按什么过滤」**：
按状态（对）还是按结算方式（错）？结算方式是"怎么付"，不是"付完没有"。

### 3.9 一单多次点单、多次付款 —— 列表必须按「最近变动」排序

**现象**：顾客又加了一道菜、或店员记了一笔定金，这张单在后台列表里**不动**，
被压在几个小时前的老单下面，店员找不到刚动过的那张。

**根因**：列表 `orderBy: { createdAt: "desc" }` —— 按**开单时间**排。
单子后续的所有动作（加菜、收款、改折扣、称重）都不影响它的位置。

**正确口径**（财务/收银场景通用）：
- 列表按 **`activityAt` 倒序**，`activityAt = max(updatedAt, settledAt, 最近流水 paidAt, 最近菜行 createdAt)`。
  `updatedAt` 由 `@updatedAt` 自动维护，加菜/改价都会推高它。
- **两种排序方向是故意的，不要统一**：
  - **列表用倒序** —— 让人先看到"刚发生的事"；
  - **单据内流水用正序**（`paidAt asc`）—— 像账本一样从早到晚读。
  混用会让人读错时间轴。

### 3.10 收款必须是**流水表**，不能是订单上的一个覆盖字段

**踩过**：第一版把已付存成 `Order.prepaidAmount`，每次 `record-prepaid` 就 `+amount` 写回去。
看似能算「需付」，但**做不了对账**：回答不了「几点、谁、用什么方式、收了多少」，
两个人同时操作还会互相覆盖。

**正确做法**（见 `docs/playbooks/finance-rules-cashier.md` 全文）：
- 独立表 `PaymentRecord`：`orderId + amount + method + kind + operator + paidAt + note + voidedAt`。
- **只追加不覆盖**：记错就标 `voidedAt` 作废，或追加一条负数 `REFUND`。
- `Order.prepaidAmount` 降级为**派生存量**，永远由 `syncPrepaidFromRecords()` 重算
  （`Σ 未作废流水`），**不许手工加减**，否则显示口径和账必然对不上。
- `kind`：`DEPOSIT`（首笔定金）/ `PARTIAL`（中途补款）/ `FINAL`（结清补差）/ `REFUND`（负数）。
- **结清补差 > 0 才落 `FINAL` 流水**，避免 0 元流水污染账本。
- 迁移时**必须回填存量** `prepaidAmount > 0` 的单，否则新逻辑从流水求和会把已付清零
  （见 `prisma/migrations/add_payment_record/migration.sql` 最后那条 INSERT）。

> ⚠️ Prisma schema 里 enum 写在 `prisma/migrations/*.sql` 时，**手写 SQL 要先 `CREATE TYPE`**，
> 否则 `type "PaymentKind" does not exist`。`IF NOT EXISTS` 要写成 `DO $$ ... pg_type ... END $$`。

### 3.11 「需付」= totalPrice − 已付，不是 subtotal，也不是 totalPrice

**现象**：FP-20261018-003 订单（小计 275 + 渔获费 96 = 总应付 371，已付定金 75），
后台订单列表的「小计 275」和「完结应付 275」被客户当成「需付」，但真需付是 **296**（371−75）。

**根因**（两处，都在 `admin/orders/page.tsx`）：
1. 卡片/完结弹窗把 `subtotal`（菜价小计）渲染在「主金额/应付」位，客户以为就是需付；
2. 完结弹窗 `SettleSheet` 的 `receivable = current.totalPrice`（371）**没减已付 75**，
   而服务端 `settle` 的 `res.amount` 却是 296（算对了）——**弹窗主金额与收款码不一致**。

**正确口径**（三层必须统一为同一公式）：
- **需付 = max(0, totalPrice − 已付流水/`prepaidAmount`)**（本例 = 371−75 = 296）
- `subtotal` 只是「菜价明细」，永远不能当需付；`fishCharge` 已含在 `totalPrice` 里。
- 任何界面展示「需付/应付/收款码金额」，都必须用 `totalPrice − prepaid`，
  并与服务端 `/settle` 的 `res.amount` 同口径（`scan:impact "PaymentRecord"` 可核对涉及点）。

**防再犯**：改订单页任何金额显示前，先确认那个数是不是 `subtotal`；
「应付类」金额一律减已付；改完跑 `node scripts/check-dashboard.cjs` 对照线上 stats 同口径。

### 3.12 「库存显示 0 / 下不了单」先查三件事：重名条目 → 分类错位 → remaining 阈值语义

**现象**（2026-10-31）：1.25 可乐进货两单（24 + 17，已过账，台账 24→41）后，仍然显示库存 0
而且**下单也被拒**；同一天管理员补录建单，试 Leo 啤酒、冰（小桶）也都「建不了单」。

**根因链**——三个坑叠在一起，只查数据层永远查不出来：

1. **重名条目（幽灵条目）**：`MenuItem` 允许同名。饮料大类下有两条「可乐 640 毫升」，
   真货（库存 24，有 `PurchaseReceiptLine` / `StockMovement` / `StockLedgerAudit` 引用）
   和一条后来误建的幽灵（库存 0，**零引用**）。人按名字选菜，**选到哪条取决于分类页顺序**，
   选到幽灵就永远库存 0、永远下不了单。
2. **分类错位**：真货被归到「烧烤」大类，幽灵在「饮料」大类 ——
   于是饮料页里看到的**恰好**是库存 0 那条，而库存 24 那条藏在烧烤页。
3. **`remaining` 返回 `null` 不是 bug**：顾客端 `/api/menu/items` 的 `stock.remaining`
   **只在 ≤ `LOW_STOCK_DISPLAY_THRESHOLD`(10) 时返回数字，其余返回 `null`**，
   这是刻意不向顾客暴露确切库存。前端**绝不能**把 `null` 当 0
   （`menu/page.tsx` 的 `handleAdd` 写成 `remaining != null && current >= remaining` 才拦，是正确写法）。
   admin 库存页读真实 `stockQty`，不受这条影响。

**排查顺序**（5 分钟定位，只读）：

```bash
node scripts/dup-menu-scan.mjs   # 扫全站重名 MenuItem + 每条被哪些表引用
```

- 会引用 `MenuItem` 的表：`OrderItem` / `PurchaseReceiptLine` / `StockMovement` /
  `StockLedgerAudit` / `StockTakeLine` / `MenuItemOptionGroup`
- **判定**：有引用 = 真货（保留）；零引用 = 幽灵（可删）
- 再看 `categoryId`：**重名条目几乎总是伴随分类错位**，两条要一起看

**处理**：

- 幽灵条目：先备份再删 `node scripts/dup-menu-cleanup.mjs <id>`
  （脚本强制做引用检查，**有引用会拒绝删除**并提示改用 `isActive=false`）
- 真货分类错了：只改 `categoryId`，**不动库存/台账**（都按 `itemId` 关联，不受影响）
- 有历史引用的重复条目（如「雪碧」那条挂着 3 个 `OrderItem`）：**只能停用，绝不硬删**

**防再犯**：

- 建菜单 / CSV 导入后跑一次 `dup-menu-scan.mjs`，重名组应为 0（或已知且已停用）
- 建单失败**必须有可读原因**：`CreateOrderModal` 已落 `saveErr` 持久红框，
  直出服务端 400 的 `code`（`INSUFFICIENT_STOCK` / `ITEM_NOT_FOUND` / `FUTURE_DATE_REJECTED`）。
  没有这层提示，用户只能看到「建不了单」而拿不到任何线索 —— 这次排查绕的弯路全源于此。

---

## 四、本机 / 工具链

### 4.1 Prisma 7 必须用 driver adapter

- **现象**：临时脚本里 `new PrismaClient()` 报
  `PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions`。
- **正确做法**：照 `src/lib/prisma.ts` 用 `PrismaPg`：
  ```js
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { PrismaClient } = require('@prisma/client');
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL || '',
    ssl: { rejectUnauthorized: false }, max: 1,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 20000,
  });
  const prisma = new PrismaClient({ adapter });
  ```

### 4.2 `next build` 要加前缀，否则误报失败

- **现象**：编译全过，最后 `> Build error occurred`、退出码 1，看着像代码错。
- **根因**：收尾清理 `.next` 时撞上 safe-delete 的单轮上限。
- **正确做法**：`CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build`

### 4.3 临时脚本用 `.cjs`，并先加载 env

- `.mjs` 是 ESM，里面写 `require(...)` 会 `ReferenceError`。
- 独立脚本**不会**自动读 `.env.local`，必须先：
  `require('dotenv').config({ path: '.env.local' })`
  且要在**创建 PrismaClient 之前**（见 4.1）。

### 4.4 Bash 输出里的中文 / 泰文是乱码，不能用来核对文案

- **正确做法**：核对文字用 **Grep / Read** 工具（正常 UTF-8），
  或写 node/python 脚本断言 `includes()`。
  Bash 只用来判断「行数 / 字节数 / 是否存在」这类与文字无关的事。

### 4.5 项目真实路径是 `C:\Users\dnlct\WorkBuddy\hook-fishpond`

- **别提**：会话工作区（`2026-10-11-17-50-46` 之类）**不是**项目所在目录，里面只有 `.workbuddy/`。
  跑去那里 `ls` / `git` 会得到空结果，白浪费时间。
- **别去 D 盘找**：`D:/github` 已退役且为空，用户明确要求**不扫描**。
- PATH 里的 `git` 已可用，不必再拼 GitHubDesktop 的绝对路径（旧笔记里的做法已过时）。

### 4.6 git 只 `add` 明确路径

- **背景**：本仓库可能同时有别的会话 / 未完成的产物目录。
- **铁律**：`git add <具体文件>`，**绝不** `git add -A` / `git add .` / `git commit -a`。
  提交前 `git diff --cached --stat` 逐个确认。看到陌生改动不要去提交、revert 或 stash。

---

## 五、部署与验证

### 5.1 推送走三层凭据链

`bash scripts/push-main.sh` —— 正常情况下第 ① 级 **SSH Deploy Key** 就免密成功。
不要手动 `git push` 折腾凭据。

### 5.2 Vercel 上有 3 个僵尸项目，只认一个

- 生效的是 **`hook-fishpond-xi15`** → https://www.hookfishpond.com
- `hook-fishpond` / `hook-fishpond-1eyy` / `hookfishpond1` 是**僵尸项目，别去动**。

### 5.3 Vercel 会**静默漏部署**某次 push——补一个空提交即可

- **现象**：`git log origin/main` 已是最新提交，本地 / 远端都对，但线上页面死活是旧文案，
  `X-Vercel-Cache: MISS`（说明抓的确实是新构建，只是内容没变）。**看不到任何构建失败**。
- **已排除**：JSON 非法、`check:i18n` 不对齐、远端缺提交、代码里混着半成品 —— 全查过，都不是。
- **解决**：`git commit --allow-empty -m "chore: 触发重新部署"` → `bash scripts/push-main.sh`，
  约 90 秒后内容就更新了。**比去 Vercel 面板翻日志快得多**。
- **判定顺序**（别一上来就怀疑代码）：
  1. 抓线上搜新文案，确认真的没更新；
  2. `git log origin/main -1` 确认远端有此提交；
  3. 本地 `next build` 能过 → 说明代码没问题，是漏部署；
  4. 直接补空提交重推。
- **注意**：补空提交前先 `git status`，确认没有把别人会话的半成品带进去（空提交本身不带你工作区的东西，安全）。

### 5.4 验证部署看「内容」，别看 chunk hash

- chunk 结构改过，`/_next/static/chunks/app/layout-*.js` 的 hash 已不可靠。
- **正确做法**：抓页面 HTML，搜一个本次新增的 i18n key 或新文案，出现即为新版本已上线。
  ```bash
  curl -s https://www.hookfishpond.com/th | grep -c "本次新增的泰文文案"
  ```
- 注意根域名会 308 跳到 `www.hookfishpond.com`，直接打 www。

---

## 六、打印（小票机）

### 6.1 打完不切纸 / 一直吐长纸

- **现象**：一张单打完，机器继续吐空白纸，纸越拉越长，或者干脆不切。
- **根因**：旧实现用 `GS V 66 n`（进纸后**半切**）。两个坑叠在一起：
  ① `n` 的单位是「**点**」（一行点阵只有几十点高），传 `n=66` 几乎等于立即切，起不到留边作用；
  ② 不少机型**不认** `66` 这个子命令，整条指令被忽略 → 完全不切。
- **正确做法**：默认改 `GS V 0`（全切，`1d 56 00`，兼容性最好），走纸改成显式 `feedLines`。
  当前默认 `feedLines: 6`（一行 ≈ 4mm，约 24mm）。
- **调参**：切在字上 / 切不断 → **调大 `feedLines`**；机型只支持半切 → 试 `cutMode: "partial"`。
- 见 `tools/print-bridge/config.json` 与 README 的「切纸参数」表。

### 6.2 蓝牙打印机「连不上」——先查服务是否在跑

- **现象**：后台点打印没反应，`/admin/print` 显示未启动，或选不到 GLPrinter。
- **根因**：**打印桥（`bridge.py`，127.0.0.1:17777）没有运行**。
  桥不在 → 网页自动退回浏览器对话框，蓝牙根本无从投递。
- **正确做法**：把 `HookFishpond-PrintBridge.vbs` 放进 Startup 文件夹做开机自启
  （模板见 `tools/print-bridge/HookFishpond-PrintBridge.vbs.example`，**要改里面的实际路径**）。
  日志在 `tools/print-bridge/bridge.log`。
- 排查顺序：`curl 127.0.0.1:17777/health` → `bridge.py --list` → 打印机是否开机 →
  「蓝牙和其他设备 → 更多蓝牙选项 → COM 端口」里 GLPrinter 对应哪个 COM 口。

### 6.3 蓝牙机是 **COM 口**，不是打印机名

- 蓝牙小票机在 Windows 上通常**不进打印机列表**，只暴露一个 SPP 虚拟串口（如 `COM8`）。
- 选目标时必须选 **`GLPrinter (COM8)`** 这种串口项；填裸名 `GLPrinter` 会报「目标不存在」。
- 本机实例：GLPrinter → `COM8`；USB 机 `POS80` 走打印队列。

### 6.4 手机不能直连这台蓝牙打印机（别白费力气）

- **现象**：想在手机上「搜索并连接打印机」，搜不到 / 连上了也没法打印。
- **根因**：`GLPrinter` 是**经典蓝牙（BR/EDR）SPP**，注册表里只有
  `BTHENUM\{00001101-0000-1000-8000-00805F9B34FB}\...`，**没有任何 BTHLE 条目**。
  而 **Web Bluetooth 只支持 BLE 设备**（GATT 服务），根本发现不了经典蓝牙；
  iPhone 的 Safari 则是**完全不支持** Web Bluetooth。
- **正确做法**：手机也必须**经过打印桥转发** —— 手机连电脑上的桥，电脑再用 USB/蓝牙发出去。
  桥默认监听 `0.0.0.0`，手机在同一 Wi-Fi 下把「打印服务地址」填成电脑的局域网 IP 即可
  （`/health` 的 `lanUrls` 会回报，设置页可直接点选）。
- **怎么判断一台蓝牙机是经典还是 BLE**：
  `Get-ChildItem HKLM:\SYSTEM\CurrentControlSet\Enum\BTHLE` 里有它就是 BLE；
  只在 `BTHENUM` 下有 `{00001101...}` 就是经典 SPP。

### 6.5 打印配置绝不能按设备各存各的

- **现象**：手机上调好了，电脑上又不对；每换一台设备就要重配一遍。
- **根因**：配置存 `localStorage`，而且是**具体端口号 / 打印机名**（`COM8`、`POS80`）。
  端口号天然绑定某台机器，跨设备必然失效。
- **正确做法**：存**数据库**（`Setting` 表，`print.preferences` 键），且存的是
  **通道偏好**（`usb` / `bluetooth` / `auto`）而不是端口号。
  实际投递时由「当前连的是哪台桥」决定落到哪个目标，偏好只表示「优先走哪条通道」。
- **例外**：桥地址（`hf.print.bridgeUrl`）仍存本机 localStorage ——
  它本来就是「这台设备怎么找到桥」，手机要填电脑局域网 IP，共用反而会坏。

### 6.6 同一台打印机被识别成两个目标

- **现象**：列表里同时有 `POS80`（USB）和 `GLPrinter (COM8)`（蓝牙），其实是同一台机。
- **不要按驱动名归组**：实测 `Microsoft IPP Class Driver` 被 Brother / TOSHIBA / EPSON
  三台**不相干的**打印机共用，按驱动归组会把它们合并成一个，比不归组更糟。
- **现在只认一条线索**：蓝牙串口的 MAC 与另一目标的 MAC **完全一致**才归组。
  名字完全不同的（`POS80` ↔ `GLPrinter`）不做自动推断 —— 由用户在设置页手动指定。
- 另：未识别蓝牙设备的 MAC 是 `000000000000`，必须排除，否则全部被归成一组。

### 6.4 `defaultPrinter` 别写死蓝牙口

- **踩过**：`config.json` 里 `defaultPrinter: "COM8"`。蓝牙一关机，**所有**单据都发不出去。
- **正确做法**：默认指向稳定的 USB 机（`POS80`）。
  蓝牙失败时前端会自动改投另一台热敏机，并提示「蓝牙未响应，已改走 POS80」。

### 6.5 蓝牙链路是好的，别急着重配对

- 实测 `CreateFile("\\\\.\\COM8")` 能成功打开，说明 SPP 端口与配对都正常。
- 遇到「连不上」先按 6.2 的顺序排查，**不要**先删设备重配对（会把 COM 口号变掉）。
- 另设了通讯超时（写 15s / 读 2s）：不设超时的话，蓝牙断链时 `WriteFile` 会一直阻塞，
  界面表现是「点了打印没反应」。

### 6.6 Agent 起的后台进程会被回收

- 用 Bash 后台起的 `bridge.py`，父进程是工具 shell，**会话结束可能被一起回收**，
  表现为「日志说已就绪，但端口拒绝连接」。
- **经 SSH 起的一律活不过会话**（实测）：`subprocess.Popen`、`wscript` + `Shell.Run`、
  detach 全部无效 —— Windows sshd 把会话放进 job object，通道一断整棵树被终止。
  表现是「起好时 health 正常，SSH 一断 10 秒后端口就没了」。
- 要长期在跑，只有两条路（**2026-10-31 已验证**）：
  1. **Startup 文件夹**（explorer 登录时拉起）—— 需要重登录才生效；
  2. **计划任务以 SYSTEM 身份**（父进程是 svchost，不在 SSH 的 job 里）—— 可远程立即生效。
     见 §6.9。
- 别再用「远程起一下看看」，会误判成「桥自己崩了」。

### 6.7 「自动出单没反应」先查三件事，别急着改代码

自动出单（新单 → 客户票 + 后厨票 + 语音播报）依赖三处同时成立，缺一处就"静默失效"：

1. **打印桥在跑**：`curl 127.0.0.1:17777/health` 要回 `{"ok":true,...}`。
   回 `upstream connect failed` 说明**没进程在听**（不是桥报错，是连接被拒）。
2. **订单列表在轮询**：`useAutoPrinter` 只在拿到新 `orders` 时才判断。
   页面若只在切换标签时 `load()`，新单永远进不来 —— **必须 12s 静默轮询**。
   这条曾导致「功能代码都在、就是不触发」。
3. **`Order.autoPrintFired` 是 false 且下单时间晚于本机值守时刻**。
   只按 flag 判断会踩大坑：曾经 14 张未结单全是 `false`，一开页面就**连打 28 张纸**。

**恢复/重开这个功能时必做**：
```js
// 把存量未结清单一次性置位，只保留"从此刻起的新单"会触发
prisma.order.updateMany({
  where: { status: { notIn: ['SETTLED','CANCELLED'] }, autoPrintFired: false,
           createdAt: { lt: new Date(Date.now() - 10*60*1000) } },
  data: { autoPrintFired: true },
});
```

**语音播报**：`src/lib/speech.ts` 走浏览器 `speechSynthesis`。
- 本机实测**没有泰语音色**（只有 David/Zira/Huihui）→ 泰文只能退化播中文。
  代码已做兜底：无泰语音色就只播中文，不硬读乱码音。
  要真正双语，得在 Windows 里装泰语语音包（设置 → 时间和语言 → 添加泰语 → 语音）。
- Chrome 的 voices 是**异步就绪**，不预热首次 `pickVoice` 常返回 null → `announceOrder` 入口调 `primeVoices()`。
- 浏览器要求页面有过用户交互才允许发声；收银台页面**先点一下屏幕**再等单。

### 6.7a 出单状态必须是三元，不是布尔

**踩过**：只用 `autoPrintFired` 一个布尔，三种情况表达不了：
① 打出来了；② 打失败了（桥没开）；③ 从没尝试过。
布尔只有两个值，于是"失败"和"没试过"混在一起 —— 结果要么每 12 秒把旧单重打一遍，
要么打失败了页面上一点痕迹都没有，店员以为已经出票。

**现在的口径**（`Order.printState`）：
| 值 | 含义 | 会不会自动重试 |
|---|---|---|
| `null` | 从未尝试 | 会（满足值守时刻条件时） |
| `PRINTED` | 已出票（自动或手动补打） | **永不**，卡片显示「🖨 已打印 14:32」 |
| `FAILED` | 出票失败 | **不会**，卡片挂红标「⚠️ 未打印」，等人工补打 |

**三条配套铁律**：
1. **两联都成功才算 PRINTED**。客户票出了、后厨票没出就标已打印 → 厨房漏菜，比没打更难查。
2. **播报放在成功之后**。先播后打会出现「响了但没票」，店员空手找单。
3. **PRINTED 不可降级**。补打时桥又断了，不能把已成功的记录改成 FAILED。

**刷新语义**：`PRINTED` 存在服务端，所以刷新页面 / 换台收银机 / 加菜都不会重打，
页面只显示「有 N 张新订单未出票」提示条（`summary.unprintedCount`）。

### 6.8 ⚠️ 桥的 `/exec` 接口是重大安全风险（本地未提交版本才有）

某会话给 `bridge.py` 加了 `POST /exec`（`shell=True` 执行任意命令）、`GET /files`（列目录）、`/speak`。
配合两个默认值就是**内网任意人可控制收银机**：

- `config.json` 里 `authToken: ""` → **为空表示完全不校验**
- 桥默认 `--host 0.0.0.0` → 同 Wi-Fi 任何设备都能访问

**处置**：确认不用就把 `/exec` 去掉；必须保留时**两件事一起做** ——
配非空 `authToken`（前端要带 `X-Print-Key`）+ 只绑 `127.0.0.1`。
临时缓解：`python bridge.py --host 127.0.0.1`（手机走桥打印会失效，但收银机本机正常）。

### 6.9 桥的生命周期与纸宽（2026-10-31 定案）

**纸宽**：POS80 用的是 **50mm 纸 → `widthDots: 464`**（80mm 才是 576）。
写成 576 会把内容压窄/错位。两套部署的 `config.json` 都要是 464。

**两套部署别混用**（机器上同时存在）：

| 目录 | 特点 |
|---|---|
| `C:\print-bridge` | 老部署，开机 bat 原本指向它；**会自动探测纸宽**（按驱动 DEVMODE） |
| `C:\hookfishpond-bridge` | 新部署，**按 `config.json` 的 `widthDots` 渲染**，可控 |

收银台实际用 **`C:\hookfishpond-bridge`**（因为宽度可控）。

**常驻方案（当前生效）**：两个计划任务，都调同一个幂等启动器
`C:\hookfishpond-bridge\start-bridge-hidden.vbs`（先 GET `/health`，活着就直接退出）：

```
schtasks /create /tn HookFishpondPrintBridge  /tr "wscript.exe //nologo <vbs>" /sc onstart /ru SYSTEM /rl HIGHEST /f
schtasks /create /tn HookFishpondBridgeWatchdog /tr "wscript.exe //nologo <vbs>" /sc minute /mo 5 /ru SYSTEM /rl HIGHEST /f
```

- `onstart`：开机就起，不需要有人登录；
- 看门狗每 5 分钟幂等巡检，桥死了最多 5 分钟内自动拉起（`onstart` 本身不监控崩溃）。

**⚠️ 配置陷阱**：`authToken` 一非空，前端就必须在 `localStorage` 里放同一个
`hf.print.bridgeKey`。而 `localStorage` **按 origin 隔离** —— 换域名（如从
`hook-fishpond-xi15.vercel.app` 换成 `www.hookfishpond.com`）后 key 全丢，
`/health` 不校验所以"探测正常"，`/print` 却一律 **401**，表现和"桥没开"极像。
**判断口诀**：看 `Order.printError` —— 写「桥未启动」是真离线；空 error 或 HTTP 401 才是鉴权。

**诊断顺序**（从便宜到贵）：
1. `curl 100.85.92.120:17777/health` → 有无 `"ok":true`、`widthDots` 对不对；
2. `schtasks /query /tn HookFishpondPrintBridge` → 任务在不在、状态；
3. `tasklist /fi "imagename eq python.exe"` → 进程在不在；
4. 查 `Order.printState / printError` → 分清「没轮询」/「桥离线」/「鉴权失败」。

**⚠️ 不要拿空 body 打 `/print` 试探鉴权**（`curl -d '{}'`）—— 实测会把桥搞挂，
得重启任务。想验鉴权就发一张真票，或者直接看前端是否带 `X-Print-Key`。

**播报链路与桥无关**：`src/lib/speech.ts` 走的是**浏览器** `speechSynthesis`，
在收银机 Chrome（Session 1，有音频设备）里播；桥跑在 Session 0 不影响播报。
所以「打印成功但没声音」要查 Chrome 的扬声器/音量/静音标签页，不要去查桥。

---

## 七、改动前的自检清单

- [ ] 涉及泰文？→ 用的是原文吗？人工看过吗？
- [ ] 动了图片渲染？→ 有没有把可见性交给 `onLoad`？
- [ ] 动了订单查询？→ 未结清单据还会被日期过滤吗？「待收款」是不是误按 `settlementMode` 过滤了？
- [ ] 动了金额显示？→ 那个数是 `subtotal` 还是 `totalPrice`？减了已付没有？
- [ ] 动了收款/退款？→ 走的是 `PaymentRecord` 流水还是改了 `prepaidAmount` 覆盖字段？
- [ ] 动了列表排序？→ 是按开单时间还是最近变动？加菜/收款会让它跳上来吗？
- [ ] 改了 `messages/*.json`？→ 跑 `node scripts/check-i18n.mjs`
- [ ] 改完构建？→ `CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build`
- [ ] 提交前？→ `git diff --cached --stat` 逐个确认，没用 `git add -A`
- [ ] 推完？→ 抓页面内容验证，而不是只看「推送成功」
- [ ] 动了打印/自动出单？→ 桥在跑吗（`/health`）？`widthDots` 是 464（50mm）吗？`printError` 写的是什么？
- [ ] 有临时脚本 / 临时文件？→ 用完删掉，别提交
