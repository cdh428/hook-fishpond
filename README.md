# Hook Fishpond 乐钓鱼塘

> 泰国鱼塘垂钓场网站 — 预约/点餐/管理后台，三语支持（中/英/泰）
> 线上地址: https://hook-fishpond-xi15.vercel.app

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端 | Next.js + React + TypeScript + Tailwind CSS | 16 / 19 / 5 / 4 |
| i18n | next-intl (zh / en / th) | — |
| 数据层 | Prisma ORM 直连 Neon PostgreSQL | 7 |
| 支付 | Omise (泰国 Opn Payments) | 待对接 |
| 部署 | Vercel | — |
| 备份 | Neon (主库) + Supabase (冷备) | GitHub Actions 每日 00:00 BKK |

## 数据库架构

**Neon 主库 + Supabase 冷备**

```
用户 → Vercel (Next.js) → Prisma ORM → Neon PostgreSQL (主库)
                                         ↓ GitHub Actions cron 0 17 * * * (BKK 00:00)
                                      Supabase (冷备, 每日被写入→永不暂停)
```

### 数据表 (10张)

| 表 | 说明 | 种子数据 |
|---|---|---|
| Pond | 鱼塘（休闲/竞赛） | 2塘 |
| Spot | 钓位 | 70位 |
| User | 用户（手机号注册） | — |
| AdminUser | 管理员 | admin / Admin@2026 |
| MenuCategory | 菜品分类 | 5类 |
| MenuItem | 菜品 | 19项 |
| Booking | 预订 | — |
| Order | 订单 | — |
| OrderItem | 订单明细 | — |
| Payment | 支付记录 | — |

## 业务模型

| 塘 | 类型 | 价格 | 预约规则 |
|---|---|---|---|
| 休闲塘 | 个人 | 100 THB/位 | 按时段（上午/下午/傍晚/全天） |
| 竞赛塘 | 团体 | 500 THB/位/天 | 最少10人，按天计算 |

## 页面结构

```
src/app/[locale]/
├── page.tsx              # 首页（鱼塘介绍）
├── menu/page.tsx        # 菜单（分类tab + 加购）
├── booking/page.tsx     # 预约（选塘/选位/选时段）
├── cart/page.tsx        # 购物车 + 结算
├── orders/page.tsx      # 订单历史
├── profile/page.tsx     # 个人中心（注册/登录/历史）
└── admin/               # 管理后台
    ├── page.tsx         # 仪表盘（KPI + 近期订单）
    ├── bookings/        # 预约管理（确认/取消）
    ├── transactions/    # 交易报表
    ├── menu/            # 菜品CRUD
    └── collect/         # 收款码生成
```

## API 路由 (24个)

```
/api/
├── auth/
│   ├── register        # 用户注册（手机号）
│   ├── login           # 用户登录
│   └── me              # 当前用户信息
├── menu/
│   ├── categories      # GET 分类列表
│   └── items           # GET 菜品列表
├── ponds/              # GET 鱼塘列表
│   └── [id]/spots/     # GET 钓位可用性
├── bookings/           # GET/POST 预订
│   └── [id]/           # PUT 确认/取消
├── orders/             # GET/POST 订单
├── payments/           # POST Omise支付
├── admin/
│   ├── auth/login      # POST 管理员登录
│   ├── stats           # GET 仪表盘KPI
│   ├── bookings/       # GET 所有预订
│   ├── orders/         # GET 所有订单
│   ├── transactions/   # GET 交易报表
│   └── menu/           # GET/POST/PUT/DELETE 菜品CRUD
```

## 前端架构

- **共享客户端**: `src/lib/api-client.ts` — 封装所有 API 调用，自动注入 `x-user-id`，snake_case → camelCase 转换
- **全局状态**: `src/contexts/AppContext.tsx` — 购物车 + 用户会话（localStorage 持久化）
- **认证**: 管理员用 httpOnly cookie `admin-session`；用户用 `x-user-id` header
- **字体**: Inter (en) + Noto Sans SC (zh) + Sarabun (th)
- **配色**: 深湖青 #155E75 + 琥珀金 #F59E0B + 淡冰青背景 #EAF6F5

## 凭据

| 用途 | 用户名 | 密码 |
|---|---|---|
| 管理员后台 | admin | Admin@2026 |
| 首页admin入口 | hook | Happy@2026 |

> 密钥/Tokens 应存放在 `.env.local`（本地）或 Vercel/GitHub Secrets（CI），不要写入代码。

## 脚本

| 脚本 | 用途 |
|---|---|
| `scripts/migrate-supabase-to-neon.js` | 一次性迁移：Supabase → Neon |
| `scripts/check-and-migrate.js` | 幂等守卫：Neon 空时自动迁移 |
| `scripts/backup-neon-to-supabase.js` | 每日备份：Neon → Supabase |

## 开发命令

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# Prisma（仅本地用：db push / seed）
npx prisma db push
npx prisma db seed

# 类型检查
npx tsc --noEmit

# 部署
vercel --prod --yes
```

## 文档索引

| 文档 | 路径 | 说明 |
|---|---|---|
| 架构设计 | `docs/ARCHITECTURE_V2.md` | V2 架构详述 |
| 设计系统 | `docs/DESIGN_SYSTEM.md` | 配色/字体/组件规范 |
| 部署指南 | `docs/SETUP_GUIDE.md` | 环境变量/Omise/数据库配置 |
| 归档文档 | `docs/archive/` | 过期文档（DEV_SUMMARY, CONNECT_GUIDE） |

## 开发状态

- ✅ V2 改版完成（2塘模式 + 用户管理 + 管理后台）
- ✅ 24个API路由全部接通 Supabase REST API
- ✅ 前端6用户页 + 4管理员页全部接通真实API
- ✅ 三语翻译对齐（222 key × 3 语言）
- ✅ Neon 主库 + Prisma 直连（23个API路由全部迁移完成）
- ✅ GitHub Actions 每日备份工作流就绪
- ⬜ Omise 真实支付对接
- ⬜ 手机号 OTP 验证
- ⬜ GitHub Secrets 配置（NEON_DATABASE_URL / SUPABASE_DATABASE_URL）
