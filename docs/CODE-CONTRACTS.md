# 代码契约（As-Built Invariants）

> 这不是设计稿（设计稿是 `ARCHITECTURE_V2.md`），而是**代码当前的既有约定**。
> 每一条都是踩过坑之后定下来的，**改动前先读这里，别凭直觉改回去**。
> 违反这些约定通常不会报错，而是**静默算错钱 / 算错库存 / 白屏**。

最后更新：2026-09-28

---

## 1. 事务与超时

- **写事务一律用 `runTx()`**（`src/lib/tx.ts`），**别用 `prisma.$transaction`**。
  后者默认 `timeout: 5000ms`；Neon（us-east-2）↔ 泰国往返 200~400ms，
  一个串行十几次的事务必然超时。`runTx()` 已设 `{ maxWait: 20000, timeout: 30000 }`。
- 涉及事务的路由加 `export const maxDuration = 60`。

## 2. 金额（唯一真相：`src/lib/orders.ts`）

```
totalPrice = subtotal + fishCharge − discountAmount
fishCharge = max(0, 总重kg − 1) × 60        // FISH_INCLUDED_KG=1 / FISH_PRICE_PER_KG=60
```

- 折扣分 `PERCENT` / `AMOUNT`；**店员上限 10%**（`STAFF_DISCOUNT_LIMIT_RATIO`），
  超额返回 `403` + `code=NEEDS_ADMIN`。
- 报表页 `SUM(Order.totalPrice)` 与交易页 `SUM(Payment.amount)` **都是净额**
  ⇒ 两边天然一致，别在其中一边改成原始金额。

## 3. 库存：三态，别退回「下单即扣」

| 阶段 | 函数 | 写什么 |
|---|---|---|
| 下单 | `reserveStock` | **只写 `reservedQty`**，不动 `stockQty` |
| 结算 | `consumeReservation` | `stockQty −= reservedQty` + 写 `SALE` 流水；靠 `stockConsumedAt` 幂等 |
| 取消 | `releaseOrderStock` | 释放预留 + 回补，写 `CANCEL` 流水 |
| 后台改单 | `applyOrderItemChange` | 按新行重算预留 |

- **不变量：`已扣量 = quantity − reservedQty`**（旧订单 `reservedQty=0` 时同样成立）。
- 前台可用量走 `computeStockView()`，别自己减。

## 4. 库存过账：两层，别混淆

- **业务层入口 `applyStockChange()`**（`src/lib/stock.ts`）
  —— 入库 / 手动调整 / 损耗自用都走这里；**自带 `runTx`**。
  - ⚠️ **只对 `stockType === 'PURCHASED'` 有效**，其他类型直接抛 `STOCK_TYPE_NOT_TRACKED`。
    （以前是「只写流水然后静默返回 ok」⇒ 前端弹「已保存」但库存根本不动。）
- **ledger 层原语 `postMovement(tx, …)`**（`src/lib/stock-ledger.ts`）
  —— 写不可变分录 + 更新余额。
  - ⚠️ **必须在 `runTx` 内调用**（不在事务里会拆成两次提交）
  - 带 `idempotencyKey` 幂等
  - `lockItem` 会加 `FOR UPDATE` 行锁，把同一菜品的过账串行化

## 5. 订单行键：按「菜品 + 选项」分行

- 键由 **`makeOptionKey(menuItemId, optionIds)`**（`src/lib/menu-options.ts`）生成。
  改单与预占**都按这个键分行**。
- 选项**只改单价，不改库存口径**（同一菜品的不同规格共用一份库存）。
- 下单时把**选项名称与加价快照进订单行** —— 菜单日后改名改价，历史订单不受影响。

## 6. 上架可见性

- **公开可售 = 菜品 `isActive` 且所属分类 `isActive`**。
- 该条件抽成了常量 `PUBLIC_ITEM_WHERE`，但它是 **`src/app/api/menu/items/route.ts`
  文件内的局部常量，没有导出到 `lib/`** —— 而且**同一个文件里有两处**（约 :49 与 :136）
  各自写了一遍，改一处必须同步另一处。
- **后台接口不过滤** —— 后台要能看到下架项。两边逻辑不同是**故意的**：管理员下架菜品后
  还能在后台找到它并重新上架；若哪天把后台也过滤了，下架就变成「再也看不见、无法恢复」。

## 7. 订单状态机

```
PENDING → PREPARING → READY → SERVED → SETTLED
                                   ↘ CANCELLED
```

- 保留 `PAID` 仅为兼容历史数据，新流程不再产生。
- 结算方式：`PREPAID`（打包默认）/ `POSTPAID`（堂食默认）。

## 8. 菜单大类

- 只有三种：`FOOD | DRINK | TOOL`，**单一真相 `src/lib/menu-types.ts`**。
- ⚠️ `MenuItem` **没有顶层 `type` 列** —— 大类由 `MenuCategory.type` 派生，
  由 `withMenuType()` 拍平成扁平结构给前端。
- ⚠️ **CSV 导入的「大类」列是按词硬编码匹配的，不是读枚举**
  ⇒ 改大类显示名必须**同时**改三处：`zhMenuType()` 的导出值 / 导入的接受集 / 报错文案。

## 9. 餐桌与订单类型

- 桌号：茅草屋 `A01–A10` / 咖啡厅 `C01–C04`；短链 `/t/<code>`。
- ⚠️ `DiningTable` **没有 `sortOrder`** ⇒ 排序一律 `orderBy: { code: 'asc' }`。
- `OrderType`：
  - `DINE_IN` **必须带有效桌号**，否则 400
  - `TAKEAWAY` 强制 `tableId = null`
- 桌号存 localStorage `fp_table_v2 = {code, date}`：**当天有效、付款完成即复位**；
  URL 上的 `?table=` 优先级最高。

## 10. SEO 路由里两个隐式约束（改之前必看）

`src/app/robots.ts` 与 `src/app/sitemap.ts` 是 Next.js 的**约定式路由**，产出
`/robots.txt` 与 `/sitemap.xml`。它们有两个不明显但很脆的前提：

1. **中间件 matcher 必须继续排除这两条路径。**
   当前 `src/middleware.ts` 的 matcher 是 `['/', '/(zh|en|th)/:path*']` ——
   正因为不匹配 `/robots.txt`，它们才不会被 307 到 `/zh/robots.txt`。
   **一旦有人把 matcher 改成全匹配，爬虫就会拿到 307 而不是 robots.txt。**
2. **它们是构建期烘焙的静态产物**（`next build` 的路由表里标 `○`）。
   意思是 URL 里的域名来自构建时的 `NEXT_PUBLIC_BASE_URL`：
   - 本地构建会写进 `http://localhost:3000`（`.env.local` 的值）—— **这是正常的，不是 bug**
   - 生产由 Vercel 的同名环境变量决定
   ⇒ 排查「sitemap 里怎么是 localhost」时，**不要改代码**，去查环境变量。

其他已定的事实（避免重复讨论）：
- sitemap 覆盖 5 个对外页面 × 3 语言 = **15 条**，每条带 `hreflang` alternates
- **刻意不写 `lastModified`** —— 拿不到每页真实修改时间；用构建时间冒充会让 `<lastmod>`
  每次部署都变，等于给爬虫制造噪音
- `robots.txt` 屏蔽：`/api/`、`/t/`（餐桌短链），以及三语下的
  `admin` / `cart` / `payment` / `orders` / `profile`
- `public/favicon.ico` 是**多尺寸**（16/32/48/64，透明底），在 `app/layout.tsx` 的
  `icons` 里**排第一位**（浏览器与爬虫默认先请求 `/favicon.ico`）

---

## 附：代码地图

| 文件 | 职责 |
|---|---|
| `lib/orders.ts` | 金额计算（唯一真相） |
| `lib/stock.ts` | `bangkokDayRange` / `computeStockView` / **`applyStockChange`** |
| `lib/stock-ledger.ts` | **`postMovement`** / `recomputeItemBalance` / `auditMaintenance` |
| `lib/stock-docs.ts` | 进货单 / 盘点单 |
| `lib/tx.ts` | **唯一事务入口** |
| `lib/menu-options.ts` + `-server.ts` | 选项键 / `resolveOrderLines` |
| `lib/menu-types.ts` · `menu-io.ts` · `reports.ts` | 大类真相 / CSV 导入导出 / 报表聚合 |
| `lib/print-receipt.ts` + `print-agent.ts` | 80mm 三张票（先探测打印桥 → 静默；否则回退浏览器打印） |
| `lib/auth.ts` | `signAdminSession` / `verifyAdminSession` / `requireAdmin` / `getUserFromRequest` |
| `lib/rate-limit.ts` · `pii.ts` · `phone.ts` | 限流 / PII 遮罩 / 手机号规范化 |
| `lib/api-client.ts` + `contexts/AppContext.tsx` | 共享客户端 + 购物车/会话 |
| **`lib/site.ts`** | **站点标识唯一真相**（`SITE_URL` / `BRAND_NAME` / `OG_IMAGE` / `OG_LOCALE`） |
| `lib/media.ts` | **素材唯一真相**（`HERO_SLIDES` / `PROMO` / `CATCH_PHOTO` / `CATCH_ILLUSTRATIONS` / `FOOD_WALL` / `PLACE_WALL` / `STORY`(12 步) / `LOGO`） |
| `lib/date-utils.ts` · `closed-days.ts` | 日期 / 休息日 |
| `i18n/routing.ts` | Link 自动加语言前缀 |
| `components/home/` | `HeroCarousel`（只在下张 `onLoad` 后才推进）/ `VideoPromo`（进视口才挂 `<video>`）/ `PhotoWall` |
| `components/layout/Footer.tsx` | `/admin/**` 下返回 `null`；`pb-24` 避开 BottomNav |
| `components/layout/HtmlShell.tsx` | 绕过 `[locale]` 的 `/t/[code]` **必须用它**，否则没有 `<html lang>` 与字体 |
| `app/[locale]/layout.tsx` | 顾客外壳（含 `generateMetadata`） |
| `app/admin/layout.tsx` | 后台外壳（登录门） |
