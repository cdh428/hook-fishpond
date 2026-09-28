# Hook Fishpond 乐钓鱼塘

> 泰国鱼塘垂钓场网站 — 预约 / 点餐 / 管理后台，三语支持（中 / 英 / 泰）
> 线上地址：**https://hookfishpond.com**（旧地址 `hook-fishpond-xi15.vercel.app` 仍可达）

## ⚠️ 安全须知（先读这一段）

**本仓库是 public。** 所以：

- **任何口令、Token、密钥都不得写进仓库** —— 包括文档、脚本、注释和「示例」。
  账号与密钥清单只记「**哪个系统 / 谁持有 / 去哪改**」，见 [`docs/CREDENTIALS.md`](docs/CREDENTIALS.md)。
- 提交前有一道 `pre-commit` 闸门会扫描暂存区新增行里的密文（GitHub PAT / `sk-` /
  AWS AK / 私钥头 / **带密码的连接串** / `ADMIN_PASSWORD=` / LINE token）。
  装闸门：`bash scripts/install-git-hooks.sh`。确需放行用 `ALLOW_SECRETS=1`，**不要**用 `--no-verify`。
- 若在旧文档里发现任何真实口令，一律**按已泄漏处理** —— 正确做法是**换掉它**，而不是删掉那行字。
  删文件不会把口令从 git 历史里拿掉。

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端 | Next.js + React + TypeScript + Tailwind CSS | 16 / 19 / 5 / 4 |
| i18n | next-intl（zh / en / th，978 键 × 3 完全对齐） | — |
| 数据层 | Prisma ORM 直连 Neon PostgreSQL | 7 |
| 支付 | PromptPay（EMVCo 二维码本地生成）；Omise 已预留未接线 | — |
| 打印 | 80mm 热敏小票机 + 本地桥（USB / 蓝牙 SPP） | — |
| 部署 | Vercel | — |
| 备份 | GitHub Actions 每日 00:00（BKK）：Neon → Supabase | — |

## 数据库架构

**Neon 主库（运行时唯一数据源） + Supabase 冷备（每日 pg_dump）**

```
用户 → Vercel (Next.js) → Prisma ORM → Neon PostgreSQL (主库)
                                         ↓ GitHub Actions cron 0 17 * * * (BKK 00:00)
                                      Supabase (冷备)
```

选型原因：Neon 支持 IPv4 直连，Vercel Serverless 不需要连接池代理；Supabase 只承担冷备。
**连接串不进仓库** —— 存放位置见 `docs/CREDENTIALS.md`。

### 数据模型（23 个 model + 17 个 enum，详见 `prisma/schema.prisma`）

| 分组 | model |
|---|---|
| 场地 | `Pond`（休闲/竞赛）· `Spot`（钓位）· `DiningTable`（茅草屋 A01–A10 / 咖啡厅 C01–C04）· `ClosedDay`（休息日） |
| 人 | `User`（顾客）· `AdminUser`（管理员，HMAC 签名会话） |
| 预约 | `Booking` |
| 菜单 | `MenuCategory` · `MenuItem` · `MenuItemOptionGroup` · `MenuItemOption` |
| 库存 | `StockMovement`（**唯一过账入口**）· `StockLedgerAudit` · `PurchaseReceipt` + `PurchaseReceiptLine` · `StockTake` + `StockTakeLine` |
| 订单 | `Order` · `OrderItem` · `Weighing`（称重）· `Payment` |
| 集成 | `ServiceCall`（呼叫服务员）· `LineTarget`（LINE 推送目标） |

## 业务模型

| 塘 | 类型 | 价格 | 预约规则 |
|---|---|---|---|
| 休闲塘 | 个人 | 100 THB/位/全天（自带竿 100 / 租竿 150，**二选一**） | 按日期 + 钓位 |
| 竞赛塘 | 团体 | 500 THB/人/天 | 最少 10 人，最多 40 人 |

营业时间 **09:00–18:00**；**周一固定休息**（另有 `ClosedDay` 可配）；同日预约 **17:00 截止**。

渔获（**可带走**）：所有鱼种首 **1 kg 免费**，超出 **60 THB/kg**（唯一禁带 `ปลาบึก` 湄公巨鲶）；
代加工 **100 THB/条**，与渔获费分开计。器材无押金，损坏/丢失统一赔 1,000 THB。

## 页面结构

```
src/app/[locale]/
├── page.tsx              # 首页（实拍轮播 / 影片 / 照片墙 / 开塘故事）
├── menu/page.tsx         # 菜单（大类 tab + 规格选项 + 加购）
├── booking/page.tsx      # 预约（选塘/选位/选日期）
├── cart/page.tsx         # 购物车 + 结算方式 + 确认下单
├── orders/page.tsx       # 订单历史
├── orders/[id]/page.tsx  # 订单详情（含打印入口）
├── profile/page.tsx      # 个人中心（注册/登录/历史）
├── payment/[id]/page.tsx # PromptPay 扫码支付
├── t/[code]/             # 餐桌码短链（绕过 [locale]，见 HtmlShell）
└── admin/                # 管理后台（登录一次全站通行）
    ├── page.tsx          # 仪表盘（KPI + 待收款 + 近期订单）
    ├── orders/           # 订单看板（状态流转/改单/称重/折扣/结算/打印）
    ├── collect/          # 收款（含待结算订单）
    ├── print/            # 打印设置与测试（USB / 蓝牙小票机）
    ├── menu/             # 菜品 CRUD + 跨大类移动 + 批量导入导出
    ├── stock/            # 库存（预占 / 入库 / 调整 / 损耗 / 盘点核对）
    ├── reports/          # 报表（总览/趋势/热销/结构/毛利/导出）
    ├── tables/           # 餐桌二维码
    ├── rest-days/        # 休息日
    ├── bookings/         # 预约管理（确认/取消）
    └── transactions/     # 交易报表
```

## 小票打印（80mm 热敏）

网页端做不到「按名称静默出纸」（`window.print()` 只能弹对话框），也打不出泰文
（热敏机内置字库没有泰文字形）。所以票据统一渲染成位图，用 ESC/POS 原始指令直发。

| 组件 | 位置 | 说明 |
|---|---|---|
| 票据模板 | `src/lib/print-receipt.ts` | 后厨单 / 预结单 / 收据（80mm，576 点） |
| 网页代理 | `src/lib/print-agent.ts` | 桥优先、探测不到自动回退浏览器对话框 |
| 本地桥 | `tools/print-bridge/` | Python 服务，支持 USB 队列与**蓝牙串口 SPP** |
| 设置页 | `/[locale]/admin/print` | 检测状态、分配目标、打测试页 |

蓝牙小票机在 Windows 上通常**不会**出现在打印机列表里，只暴露一个 SPP 虚拟串口
（如 GLPrinter → `COM8`），桥接服务直接往该串口写 ESC/POS 字节。详见
`tools/print-bridge/README.md`。

## API 路由（61 个 `route.ts`）

```
src/app/api/
├─ 顾客侧（17）
│  ├─ auth/register · auth/login · auth/me
│  ├─ ponds/ · ponds/[id]/spots/ · tables/ · closed-days/
│  ├─ menu/categories/ · menu/items/
│  ├─ bookings/ · bookings/[id]/
│  ├─ orders/ · orders/[id]/ · orders/table/[code]/
│  ├─ payments/ · payments/[id]/
│  └─ service-calls/
├─ 管理后台（40，全部要求 admin 会话）
│  ├─ auth/login · auth/logout · auth/me · stats/ · transactions/
│  ├─ orders/ · orders/[id]/（改单 / 称重 / 结算 / 库存修复）
│  ├─ bookings/ · tables/ · tables/[id]/ · closed-days/ · closed-days/[id]/
│  ├─ service-calls/
│  ├─ reports/ · reports/export/
│  ├─ menu/：categories · categories/[id] · items · items/move · items/[id] ·
│  │         items/[id]/options · options/template · template · import · import/commit · export
│  ├─ stock/：本表 · [itemId] · [itemId]/{adjust,purchase,waste,soldout} ·
│  │          receipts · receipts/[id] · stock-takes · reconcile
│  └─ line/
└─ 集成（4）
   ├─ webhooks/line/      LINE Messaging 回调（验签 + 自动登记推送目标）
   ├─ webhooks/omise/     Omise 回调（预留，需 OMISE_WEBHOOK_SECRET）
   ├─ cron/daily-report/  每日 BKK 21:00 推经营日报到 LINE
   └─ cron/stock-sweep/   释放过期库存预占
```

## 前端架构

- **共享客户端**: `src/lib/api-client.ts` — 封装所有 API 调用，自动注入 `x-user-id`，snake_case → camelCase
- **全局状态**: `src/contexts/AppContext.tsx` — 购物车 + 用户会话（localStorage 持久化）
- **认证**: 管理员用 httpOnly cookie `admin-session`（HMAC 签名）；用户用 `x-user-id` header
- **字体**: Inter (en) + Noto Sans SC (zh) + Sarabun (th)
- **配色**: 深湖青 #155E75 + 琥珀金 #F59E0B + 淡冰青背景 #EAF6F5

## 账号与密钥

**本仓库不记录任何口令。** 需要登录或改密钥时看 [`docs/CREDENTIALS.md`](docs/CREDENTIALS.md)：
那里只写「哪个系统 / 谁持有 / 去哪改」。

存放位置：

| 场景 | 位置 |
|---|---|
| 本地开发 | `.env.local`（已被 `.gitignore` 忽略；模板见 `.env.example`） |
| 生产运行时 | Vercel → Project → Settings → Environment Variables |
| CI / 备份 | GitHub → Repo → Settings → Secrets and variables → Actions |
| 推送凭据 | 三层链，见 `scripts/push-main.sh` 与 `docs/playbooks/` |

## 脚本

| 脚本 | 用途 |
|---|---|
| `scripts/migrate-supabase-to-neon.js` | 一次性迁移：Supabase → Neon |
| `scripts/check-and-migrate.js` | 幂等守卫：Neon 空时自动迁移 |
| `scripts/backup-neon-to-supabase.js` | 每日备份：Neon → Supabase |
| `scripts/check-i18n.mjs` | 三语键对齐 + 语言字符范围核验（`--live` 可核验线上） |
| `scripts/rotate-admin-password.mjs` | 轮换管理员口令（**永不打印**） |
| `scripts/push-main.sh` | 推送入口（三层凭据链，第一级成功即停） |
| `scripts/check-secrets.sh` | 密文扫描（pre-commit 调它） |
| `scripts/install-git-hooks.sh` | 安装 `pre-commit` 闸门 |
| `scripts/e2e-menu-move.mjs` | 端到端：跨大类移动菜品（需 `E2E_ADMIN_PASSWORD`） |

## 开发命令

```bash
npm install

# 本地开发
npm run dev

# Prisma（仅本地用：db push / seed）
npx prisma db push
npx prisma db seed          # 需先设 SEED_ADMIN_PASSWORD

# 质量闸门
npx tsc --noEmit
npm run check:i18n

# 构建 + 本地验证（统一用 3100 端口）
npx next build
npx next start -p 3100

# 推送（第一级：SSH Deploy Key）
bash scripts/push-main.sh --dry-run --verbose
bash scripts/push-main.sh
```

## 文档索引

| 文档 | 路径 | 说明 |
|---|---|---|
| **账号与密钥清单** | `docs/CREDENTIALS.md` | 哪个系统 / 谁持有 / 去哪改（**不含任何值**） |
| 架构设计 | `docs/ARCHITECTURE_V2.md` | V2 架构详述 |
| 设计系统 | `docs/DESIGN_SYSTEM.md` | 配色/字体/圆角/浮层层级规范 |
| 运营手册 | `docs/OPERATIONS.md` | 每天 / 每周 / 每月要做什么 |
| 本地增长与 API 计划 | `docs/local-growth-and-api-plan.html` | Google 商家资料 / Meta / LINE / OTP 四条线的分步计划 |
| 顾客 OTP 方案 | `docs/otp-line-login-oa-plan.html` | LINE Login + 官方账号收码（零短信成本） |
| LINE 官方账号管理 | `docs/LINE-OA-MANAGEMENT.md` | OA 配置与推送目标维护 |
| 部署指南 | `docs/SETUP_GUIDE.md` | 环境变量 / 数据库 / 部署（**历史文档，含过期信息**） |
| 小票打印 | `tools/print-bridge/README.md` | 打印桥部署、蓝牙 SPP、排错 |
| 归档文档 | `docs/archive/` | 过期文档（DEV_SUMMARY, CONNECT_GUIDE） |

## 开发状态

- ✅ V2 改版完成：2 塘模式 + 用户管理 + 管理后台（三语 zh/en/th）
- ✅ Neon 主库 + Prisma 直连（全部 API 已迁移，无 IPv4/IPv6 问题）
- ✅ 订单全链路：确认下单 → 库存预占 → 称重 → 折扣 → 结算 → 80mm 打印
- ✅ 库存三态（预占/扣减/释放）+ 台账 + 盘点核对 + 单一过账入口
- ✅ 小票打印：USB 队列 + 蓝牙 SPP 双通道，网页端桥优先 / 自动回退
- ✅ 报表（总览 / 趋势 / 热销 / 结构 / 毛利 / 导出）+ LINE 每日日报
- ✅ 自定义域名 `hookfishpond.com` 已生效
- ✅ GitHub Actions 每日冷备
- ⬜ 首页 metadata（`metadataBase` / canonical / openGraph / icons）—— 让 `hookfishpond.com` 成为 Google 眼中的正主
- ⬜ 顾客 OTP（方案已定：LINE Login + 官方账号收码；等 LINE 渠道配置）
- ⬜ Omise 真实支付对接（接口已预留）
- ⬜ TypeScript / 三语 / 密文扫描上 CI
