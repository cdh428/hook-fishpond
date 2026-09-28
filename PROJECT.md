# PROJECT.md — 项目总纲

> **接手这个项目，先读这一份。**
> 它回答「这是什么 / 谁在用 / 边界在哪 / 为什么现在是这个样子」。
>
> - 日常要做什么 → [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
> - 账号与密钥在哪 → [`docs/CREDENTIALS.md`](docs/CREDENTIALS.md)
> - 改完怎么发上去 → [`docs/playbooks/push-checklist.md`](docs/playbooks/push-checklist.md)
> - 环境和命令 → [`README.md`](README.md) · [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)
> - AI 运营团队 / 社媒发布 → [`docs/AGENT-TEAM.md`](docs/AGENT-TEAM.md) · [`docs/playbooks/social-publishing.md`](docs/playbooks/social-publishing.md)

---

## 一、这是什么

泰国一处休闲钓场的**顾客端网站 + 现场经营后台**。

| | |
|---|---|
| 线上地址 | **https://hookfishpond.com** |
| 代码仓库 | github.com/cdh428/hook-fishpond（⚠️ **public**） |
| 语言 | 中文 / English / ไทย（`/zh` `/en` `/th`） |
| 技术栈 | Next.js 16 + React 19 + TypeScript + Tailwind 4 + next-intl |
| 数据 | Prisma 7 直连 Neon PostgreSQL（Supabase 只做每日冷备） |
| 部署 | Vercel（项目名 `hook-fishpond-xi15`） |

### 两个塘

| 塘 | 类型 | 价格 | 规则 |
|---|---|---|---|
| 休闲塘 | 个人 | **100 ฿/位/天**（自带竿 100 / 租竿 150，**二选一**） | 约 30 个钓位 |
| 竞赛塘 | 团体 | **500 ฿/人/天** | 10 人起，最多 40 人；**按人头**计费 |

营业 **09:00–18:00**，**周一固定休息**，同日预约 **17:00 截止**。

### 顾客能做什么

看首页 → 预约钓位 → 点餐（堂食 / 打包）→ 扫码付 PromptPay → 查自己的订单。
扫桌上的二维码（`/t/<桌号>`）可直接进入点餐。

### 店员能做什么

订单看板（状态流转 / 改单 / 称重 / 折扣 / 结算）、出 80mm 小票（USB 或蓝牙）、
菜单与库存管理、报表、预约与休息日、餐桌二维码生成。

---

## 二、谁在用

| 角色 | 入口 | 说明 |
|---|---|---|
| 顾客 | 手机浏览器 | 中/英/泰三语；现场扫桌码 |
| 现场店员 | 收银机浏览器 → `/zh/admin` | 日常经营全靠它；口令见 `CREDENTIALS.md` |
| 店主 | 同上 | SUPER_ADMIN，能改口令、看全部报表 |
| 开发者 | 本机 | Node 22；⚠️ **本地服务与线上共用同一个数据库** |

> ⚠️ **本地 = 生产库**。任何测试脚本都必须写成**净零副作用**（用完自清并断言回基线）。
> 写法和真实案例见 `docs/playbooks/push-checklist.md` 的「验证脚本的设计原则」。

---

## 三、边界：这个项目**不**做什么

写下来是为了避免后来者越界改动。

- **不做会员 / 积分 / 营销系统。**
- **不做多门店**：数据模型就是单场馆的。
- **不做支付网关真实对接**：Omise 的接口预留但从未接线；线上收款是
  **PromptPay 静态二维码 + 店员人工确认到账**。
- **不做顾客手机号验证**：顾客身份靠 `x-user-id` 请求头，**理论上可伪造**。
  这是已知的、明确的取舍；真正的修法是上 OTP（方案已定，待接入 LINE 渠道）。
- **不把「现场可以灵活处置」的事写成规则**。区分标准：
  **必须统一口径**的（计价 / 安全 / 赔偿 / 禁带）→ 写进规则页；
  **现场可判断**的（奖励力度 / 个案补偿）→ 最多口头提一句，别推进文档。

---

## 四、关键决策记录

| 日期 | 决策 | 为什么 |
|---|---|---|
| 2026-07-10 | V2 改版：两塘模式 + 用户管理 + 管理后台 | 旧版模型（Zone）表达不了两个塘的差异 |
| 2026-07-16 | 数据层改用 Supabase REST | |
| 2026-07-28 | **改回 Prisma + Neon** | Vercel 无 IPv6、Supabase 直连只有 IPv6；REST 表达力也不够 |
| 2026-09-20 | **三语核验成为推送硬性前置** | 用户明确要求：推送改动页面前必须核验其它语言页面 |
| 2026-09-25 | 渔获规则统一为「**所有鱼种**首 1 kg 免费」 | 现场价目牌只把规则挂在一种鱼上，判断为「牌子写窄了」，以网页口径为准 |
| 2026-09-26 | 库存改为**三态**（预占 → 扣减 → 释放） | 「下单即扣」在打包/改单/取消时会把账算歪 |
| 2026-09-26 | 安全审计落地：HMAC 会话 / 删 `?phone=` / 安全响应头 / seed 读环境变量 | 见 `docs/playbooks/security-audit.md` |
| 2026-09-27 | 管理员口令轮换；推送改为**三层凭据链** | 口令曾明文进仓库；PAT 权限过大 |
| 2026-09-28 | 自有域名 `hookfishpond.com` 上线；生产标识（canonical / OG / icons）收口 | 旧 `*.vercel.app` 会让 Google 认错正主 |
| 2026-09-28 | 上密文闸门（`scripts/check-secrets.sh` + CI）；**公开仓库里的活凭据按已泄漏处置** | 见 `CREDENTIALS.md` §5 |

---

## 五、代码结构速览

```
src/
├── app/
│   ├── layout.tsx              # 全站 metadata 底座（metadataBase / icons）
│   ├── [locale]/               # 顾客端（含 admin 后台）
│   └── api/                    # 61 个 route.ts（40 个需要 admin 会话）
├── components/                 # layout / home / admin / ui
├── contexts/AppContext.tsx     # 购物车 + 会话（localStorage）
├── lib/                        # 见下表
└── i18n/                       # routing + 语言探测
messages/{zh,en,th}.json        # 978 键 × 3，必须完全对齐
prisma/schema.prisma            # 23 model + 17 enum
tools/print-bridge/             # 本地打印桥（Python，只监听 127.0.0.1）
docs/playbooks/                 # 流程知识（推送 / 安全 / 素材）
```

### 改代码前必须知道的 5 个「唯一真相」

| 关注点 | 唯一入口 | 铁律 |
|---|---|---|
| 金额 | `src/lib/orders.ts` | `totalPrice = subtotal + fishCharge − discountAmount`；报价与报表都必须走它 |
| 库存 | `src/lib/stock.ts` | 只走 `applyStockChange()` 过账；预占/扣减/释放三态别退回「下单即扣」 |
| 事务 | `src/lib/tx.ts` | 一律 `runTx()`；Neon 往返 200–400ms，用默认 5s 超时必挂 |
| 菜单大类 | `src/lib/menu-types.ts` | 别再各处写 `'FOOD'` 字面量 |
| 素材 | `src/lib/media.ts` | 加一条前先确认 `public/media/` 里 jpg + webp 都在 |

---

## 六、当前待办（对外部依赖的部分）

| # | 事项 | 卡在谁 |
|---|---|---|
| 1 | 🔴 **轮换 Supabase 冷备库口令** | 用户（见 `CREDENTIALS.md` §5） |
| 2 | 🔴 撤销那把全权限 GitHub PAT | 用户（github.com/settings/tokens） |
| 3 | Google 商家资料**重复**：先对齐 NAP，再报重复 | 用户取证（见 `local-growth-and-api-plan.html` 情形 D） |
| 4 | 顾客 OTP：建 LINE Login 渠道（须与现有 Messaging 渠道同一 Provider） | 用户 |
| 5 | 统一品牌名（现在有 4 个写法） | 需确认**实体招牌**上写的是哪个 |
| 6 | 断开 Vercel 上 3 个僵尸项目 | 用户后台操作 |
| 7 | 社媒令牌：IG 切专业账号 + 绑 FB 主页 + Meta 应用拿主页令牌（FB/IG 一键发帖的开关） | 用户（见 `docs/playbooks/social-publishing.md`） |
