# 乐钓鱼塘（Hook Fishpond）开发总结文档

> **文档用途**：供 Agent 团队快速理解项目当前开发状况、技术架构、已完成功能及待开发事项。
> **最后更新**：2026-06-21

---

## 一、项目概述

| 属性 | 内容 |
|------|------|
| **项目名称** | 乐钓鱼塘 / Happy Fishing Pond / บ่อตกปลาแฮปปี้ |
| **项目类型** | 面向顾客的移动端 Web 应用（PWA-ready 的 Next.js 网站） |
| **目标市场** | 泰国鱼塘休闲钓鱼场景，面向中文、英文、泰文三语用户 |
| **货币单位** | 泰铢（THB / ฿） |
| **代码仓库** | GitHub（`hook-fishpond`） |
| **运行环境** | Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4 |

---

## 二、技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | ^16.2.0 | App Router，SSR/SSG，API Routes |
| React | ^19.2.4 | UI 框架 |
| TypeScript | ^5.9.3 | 静态类型 |
| Tailwind CSS | ^4.2.2 | 样式（搭配 @tailwindcss/postcss） |
| next-intl | ^4.8.3 | 国际化（i18n）路由与翻译 |
| react-icons | ^5.6.0 | 图标库（已安装但暂未大量使用） |
| qrcode | ^1.5.4 | 支付 QR 码生成（已安装，待集成） |

### 后端 / 数据层

| 技术 | 版本 | 用途 |
|------|------|------|
| Prisma | ^7.5.0 | ORM + 数据库 Schema 管理 |
| PostgreSQL | — | 主数据库（通过 `DATABASE_URL` 环境变量配置） |
| Omise (Opn Payments) | ^1.1.0 | 支付网关（泰国主流支付方式集成） |

### 外部服务

| 服务 | 用途 | 状态 |
|------|------|------|
| Omise (opn.com) | 支付处理 | 已集成代码，需配置密钥 |
| Supabase | 托管 PostgreSQL（推测） | 有 token，待连接 |
| Google Fonts | Noto Sans SC / Noto Sans Thai / Inter 字体 | 已引用 |

---

## 三、项目结构

```
hook-fishpond/
├── messages/               # 多语言翻译文件
│   ├── zh.json             # 中文
│   ├── en.json             # 英文
│   └── th.json             # 泰文
├── prisma/
│   └── schema.prisma       # 数据库 Schema（已完整定义）
├── src/
│   ├── app/
│   │   ├── [locale]/       # 多语言路由根
│   │   │   ├── layout.tsx  # 公共布局（Header + BottomNav）
│   │   │   ├── page.tsx    # 首页
│   │   │   ├── booking/    # 钓位预约页
│   │   │   ├── menu/       # 食物菜单页
│   │   │   ├── drinks/     # 饮料菜单页
│   │   │   ├── cart/       # 购物车 + 支付页
│   │   │   ├── orders/     # 我的订单页
│   │   │   └── admin/      # 管理后台页（骨架）
│   │   ├── api/
│   │   │   ├── payments/route.ts        # 创建支付 API
│   │   │   └── webhooks/omise/route.ts  # Omise 支付回调 Webhook
│   │   ├── globals.css     # 全局样式
│   │   ├── layout.tsx      # 根布局
│   │   └── page.tsx        # 根路径（重定向到 /zh）
│   ├── components/
│   │   └── layout/
│   │       ├── Header.tsx  # 顶部导航栏（含语言切换）
│   │       └── BottomNav.tsx  # 底部导航栏
│   ├── i18n/
│   │   ├── config.ts       # 语言配置（zh/en/th，默认 zh）
│   │   ├── request.ts      # next-intl 服务端请求配置
│   │   └── routing.ts      # next-intl 路由配置
│   ├── lib/
│   │   └── omise.ts        # Omise 支付工具函数
│   └── middleware.ts       # next-intl 路由中间件
├── next.config.mjs         # Next.js + next-intl 配置
├── package.json
└── tsconfig.json
```

---

## 四、数据库 Schema（Prisma）

### 完整数据模型

```
Zone（鱼塘区域）
  └── Spot（钓位）
        └── Booking（预约）
                └── Order（订单，可选关联）

MenuCategory（菜单分类）
  └── MenuItem（菜单项目）
        └── OrderItem（订单明细）

Order（订单）
  ├── OrderItem[]（订单项）
  ├── Booking[]（关联预约，可选）
  └── Payment（支付记录）
```

### 关键枚举

| 枚举 | 值 |
|------|----|
| **TimeSlot** | MORNING(06-12), AFTERNOON(12-18), EVENING(18-22), FULL_DAY |
| **BookingStatus** | PENDING, CONFIRMED, CANCELLED |
| **MenuType** | FOOD, DRINK |
| **OrderStatus** | PENDING, PAID, PREPARING, READY, CANCELLED |
| **PaymentMethod** | PROMPTPAY, TRUEMONEY, BANK_TRANSFER, CREDIT_CARD, ALIPAY, WECHAT_PAY |
| **PaymentStatus** | PENDING, PROCESSING, SUCCESSFUL, FAILED, REFUNDED |

### 注意
- 所有多语言名称字段均采用 `name_zh` / `name_en` / `name_th` 三字段存储
- 货币统一为 THB（泰铢）
- 订单号格式：`FP-YYYYMMDD-NNN`

---

## 五、已开发功能详情

### ✅ 5.1 国际化（i18n）系统

- **实现方式**：`next-intl` v4，URL 路径前缀方案（`/zh/...`, `/en/...`, `/th/...`）
- **支持语言**：中文（默认）、English、ภาษาไทย
- **切换方式**：Header 右上角语言选择器，无需刷新页面
- **翻译覆盖**：全页面文案（公用、首页、预约、菜单、饮料、购物车、支付、订单）
- **字体**：Google Fonts 按语言加载 Noto Sans SC / Noto Sans Thai / Inter

### ✅ 5.2 首页（Home Page）

**路由**：`/[locale]`

- Hero 区域：渐变蓝色背景 + 波浪装饰，展示欢迎语
- 快捷入口：3 个卡片按钮（预约钓位 / 点餐 / 点饮料）
- 功能介绍：3 张特色介绍卡片（鱼种 / 美食 / 饮料）

### ✅ 5.3 钓位预约页（Booking Page）

**路由**：`/[locale]/booking`

**UI 功能**（全 Client Component，当前用 Demo 数据）：
- 区域切换：A区(大鱼塘,40位) / B区(休闲塘,30位) / C区(VIP塘,20位)
- 日期选择：原生 Date Picker，最小日期为今天
- 时段选择：上午 / 下午 / 傍晚 / 全天（4 宫格）
- 钓位地图网格：8列布局，绿色=可选，红色=已占，蓝色=已选中
- 价格实时计算：半天/全天不同定价
- 顾客信息填写：姓名 + 电话
- 确认弹窗：成功提示 Modal

**⚠️ 当前状态**：全部为硬编码 Demo 数据，**未连接数据库**

### ✅ 5.4 食物菜单页（Menu Page）

**路由**：`/[locale]/menu`

- 分类 Tab：热门推荐 / 泰式料理 / 海鲜 / 烧烤 / 汤类 / 小食（sticky 吸顶）
- 菜品卡片：emoji 占位图 + 名称 + 辣度 + 素食标签 + 价格 + 加入购物车按钮
- 购物车计数：已添加商品实时显示数量，底部浮动前往购物车按钮
- 15 个菜品 Demo 数据（含价格 20-350 THB）

**⚠️ 当前状态**：Demo 数据，购物车状态仅在组件内存中，页面跳转后丢失（无全局状态管理）

### ✅ 5.5 饮料菜单页（Drinks Page）

**路由**：`/[locale]/drinks`

- 分类 Tab：冷饮 / 热饮 / 酒类 / 鲜榨果汁
- 2列卡片网格布局，emoji 展示
- 13 种饮料 Demo 数据（含价格 15-80 THB）
- 与菜单页相同的购物车逻辑（独立状态，无跨页共享）

**⚠️ 当前状态**：Demo 数据，购物车状态孤立

### ✅ 5.6 购物车页（Cart Page）

**路由**：`/[locale]/cart`

- 购物车商品列表：增减数量、自动删除零数量商品
- 订单备注输入框
- 合计金额实时计算
- 结算流程：点击结算 → 展开支付方式选择 → 确认支付
- **支付方式**（6种）：PromptPay / TrueMoney / 银行转账 / 信用卡 / 支付宝 / 微信支付
- 支付成功状态页（当前为模拟，2秒延迟）

**⚠️ 当前状态**：使用硬编码 Demo 购物车数据，支付为模拟（未调用 Omise API）

### ✅ 5.7 订单页（Orders Page）

**路由**：`/[locale]/orders`

- 订单列表：订单号 / 商品明细 / 状态标签 / 总价 / 时间
- 状态色彩系统：黄(待支付) / 蓝(已支付) / 橙(准备中) / 绿(已完成) / 红(已取消)

**⚠️ 当前状态**：Demo 数据，未连接数据库

### ✅ 5.8 管理后台（Admin Page）

**路由**：`/[locale]/admin`

- Dashboard Tab：4 个 KPI 卡片（今日预约/今日收入/待处理订单/活跃钓位）+ 近期订单列表
- Spots Tab：骨架 UI（提示"连接数据库后启用"）
- Menu Tab：骨架 UI（提示"连接数据库后启用"）
- Orders Tab：骨架 UI（提示"连接数据库后启用"）

**⚠️ 当前状态**：Dashboard 为硬编码数字，其余 Tab 均为占位内容，**无权限控制**

### ✅ 5.9 布局组件

**Header（顶部导航）**：
- 网站名称（按语言显示）
- 语言切换下拉菜单（sticky 吸顶）

**BottomNav（底部导航栏）**：
- 5 个导航项：首页 / 钓位预约 / 美食点餐 / 饮料 / 购物车
- 当前页高亮（蓝色）

### ✅ 5.10 支付 API

**已实现**：
- `POST /api/payments` — 创建 Omise 支付（PromptPay、TrueMoney、信用卡等）
- `POST /api/webhooks/omise` — 接收 Omise 支付回调事件（`charge.complete`）

**Omise 支持的支付方式（已映射）**：
- promptpay、truemoney、credit_card、alipay、wechat_pay
- 银行网银：internet_banking_scb（默认 SCB）、kbank、bbl、bay

**⚠️ 当前状态**：API 代码完整，但 Webhook 中 Prisma 数据库更新调用均为 `TODO` 注释状态

---

## 六、⚠️ 尚未开发 / 待完善事项（优先级排序）

### 🔴 高优先级（核心功能缺口）

| # | 功能 | 说明 |
|---|------|------|
| 1 | **数据库连接** | 配置 `DATABASE_URL`，运行 `prisma db push` 建表 |
| 2 | **全局购物车状态** | 目前 Menu / Drinks / Cart 三个页面的购物车状态互不相通；需引入 React Context 或 Zustand/Jotai |
| 3 | **预约 API** | `POST /api/bookings` — 保存预约到数据库，实时检查冲突 |
| 4 | **菜单 API** | `GET /api/menu` — 从数据库读取菜单分类和菜品 |
| 5 | **订单 API** | `POST /api/orders`（创建订单）、`GET /api/orders`（查询订单列表） |
| 6 | **支付闭环** | 将 Cart 页的"模拟支付"接入真实 Omise API；完成 Webhook 中的数据库状态更新 |

### 🟡 中优先级（重要体验）

| # | 功能 | 说明 |
|---|------|------|
| 7 | **预约实时可用性** | Booking 页面需从数据库查询当天/指定日期已占用的钓位 |
| 8 | **管理后台功能化** | 区域/钓位 CRUD、菜单 CRUD、订单状态管理 |
| 9 | **管理员身份验证** | Admin 页面目前完全无权限控制，任何人均可访问 |
| 10 | **订单关联预约** | 支持将餐饮订单与钓位预约绑定为一个 Order（Prisma Schema 已支持） |
| 11 | **图片上传** | 菜品/区域图片目前为 emoji 占位，需接入对象存储（建议 Supabase Storage） |

### 🟢 低优先级（增强功能）

| # | 功能 | 说明 |
|---|------|------|
| 12 | **PromptPay QR 显示** | 支付后展示 QR 码图片（`qrcode` 包已安装待用） |
| 13 | **订单实时推送** | 厨房收到新订单通知（WebSocket 或 SSE） |
| 14 | **种子数据** | `package.json` 已配置 `db:seed`，但 `prisma/seed.ts` 文件不存在 |
| 15 | **Orders 页关联预约** | 目前订单页只显示餐饮，未显示已预约的钓位信息 |
| 16 | **语言检测优化** | 部分组件用 `window.location.pathname.split('/')[1]` 检测语言，应改用 `useLocale()` hook |

---

## 七、已知 Bug / 代码问题

| 位置 | 问题 | 建议修复 |
|------|------|---------|
| `booking/page.tsx` | `getZoneName()` 使用 `window.location` 检测语言（SSR 不安全） | 改用 `useLocale()` |
| `menu/page.tsx` | `getLocaleName()` 同上 | 改用 `useLocale()` |
| `drinks/page.tsx` | `getLocaleName()` 同上 | 改用 `useLocale()` |
| `cart/page.tsx` | 购物车使用硬编码 Demo 数据，不来自真实购物流程 | 接入全局状态 |
| `menu/page.tsx` | 浮动购物车按钮用 `href="cart"` 相对路径，不含 locale 前缀 | 改用 `<Link href="/cart">` |
| `lib/omise.ts` | `verifyWebhook()` 函数直接返回 `true`，未实现签名验证 | 实现 HMAC 验签 |
| `[locale]/layout.tsx` | `fontClass` 对三种语言都返回 `'font-sans'`，`dir` 也固定为 `'ltr'`，无实际差异化 | 可清理冗余逻辑 |

---

## 八、环境变量（需配置）

创建项目根目录的 `.env` 文件（不要提交到 Git）：

```env
# 数据库
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

# Omise 支付（从 https://dashboard.omise.co 获取）
OMISE_PUBLIC_KEY="pkey_test_xxxxxxxxxxxx"
OMISE_SECRET_KEY="skey_test_xxxxxxxxxxxx"

# 网站域名（用于支付回调 return_uri）
NEXT_PUBLIC_BASE_URL="https://yourdomain.com"
```

> **说明**：项目中 `fish pond token.txt` 文件保存了 GitHub PAT 和 Supabase token，建议：
> 1. 将其移入 `.env`，从 `.gitignore` 排除
> 2. Supabase 项目 URL 需确认后配置到 `DATABASE_URL`

---

## 九、开发启动命令

```bash
# 安装依赖
npm install

# 初始化数据库（首次）
npm run db:push

# 填充种子数据（种子文件待创建）
npm run db:seed

# 本地开发
npm run dev

# 构建生产版
npm run build
npm start
```

---

## 十、下一步开发建议（路线图）

### Phase 1：数据接通（1-2 天）
1. 配置 Supabase PostgreSQL 的 `DATABASE_URL`
2. `prisma db push` 建表
3. 实现 `GET /api/zones-spots` API，将 Booking 页面改为真实数据
4. 实现 `GET /api/menu` API，将 Menu / Drinks 页改为真实数据
5. 创建 `prisma/seed.ts`，填充 Demo 数据

### Phase 2：购物车与订单（2-3 天）
1. 引入全局购物车状态（推荐 React Context + localStorage 持久化）
2. 实现 `POST /api/orders` 创建订单
3. 实现 `GET /api/orders` 查询用户订单
4. 将 Cart 页支付流程接入真实 Omise API
5. 完善 Webhook 处理（更新 Order / Payment 状态）

### Phase 3：管理后台（3-5 天）
1. 添加管理员登录认证（推荐 NextAuth.js 或 Supabase Auth）
2. 实现区域/钓位管理 CRUD API + 管理后台 UI
3. 实现菜单管理 CRUD API + 管理后台 UI
4. 实现订单管理（状态更新、实时列表）

### Phase 4：体验优化
1. 替换 emoji 为真实菜品图片（接入 Supabase Storage）
2. PromptPay 支付 QR 码显示
3. 修复所有已知 Bug（见第七节）
4. 添加加载状态、错误边界
5. PWA manifest 配置（可离线访问）

---

## 十一、项目定位说明

这是一个**泰国鱼塘休闲场所**的点单+预约一体化移动端 Web App，核心使用场景为：

- 顾客到达鱼塘，扫码打开 Web App
- 选择钓位并预约时段
- 在鱼塘内点餐/点饮料
- 在线支付（泰国主流支付方式）
- 查看订单状态

目标用户群为：**在泰国的中文、英文、泰文用户**，UI 风格为移动端优先（`max-w-lg` 居中布局），类似微信小程序的体验形态。

---

*文档由 WorkBuddy 智能设计助手自动生成 · 2026-06-21*
