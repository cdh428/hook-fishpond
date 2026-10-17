# Hook Fishpond — 运行指南

> ⚠️ **历史文档（2026-07 编写，2026-09-28 脱敏）。**
> 部分内容已过期 —— 数据层现为 **Neon 主库 + Prisma 直连**（不再是 Supabase），
> 前端已全部接通真实 API（不再用演示数据）。
> 当前权威信息看：[`README.md`](../README.md) · [`CREDENTIALS.md`](./CREDENTIALS.md) ·
> [`ARCHITECTURE_V2.md`](./ARCHITECTURE_V2.md)。
>
> **本文件不再包含任何真实口令或连接串。** 需要值时看 `CREDENTIALS.md`。

> 按顺序完成以下步骤，每步完成后再进行下一步。

---

## 第 1 步：获取 Omise 支付密钥

1. 打开 https://dashboard.omise.co/
2. 注册/登录你的 Omise 账号
3. 左侧菜单点击 **Keys**
4. 你会看到两组密钥：
   - **Test** 模式：`pkey_test_...` 和 `skey_test_...`
   - **Live** 模式：`pkey_live_...` 和 `skey_live_...`
5. 现在先用 **Test** 模式的密钥（上线后再换 Live）
6. 把 `pkey_test_...` 和 `skey_test_...` 写进 `.env.local`（**不要写进仓库里任何文件**）

> 如果你还没有 Omise 账号，可以先跳过这步，支付功能暂时不用。其他功能（浏览、预约、菜单）不受影响。
> 实际线上收款目前走 **PromptPay**（`PROMPTPAY_ID`）；Omise 接口已预留但未接线。

---

## 第 2 步：更新本地 .env.local 文件

用编辑器打开项目根目录的 `.env.local`（模板见 `.env.example`）。

需要填的值：Omise 密钥（如果第 1 步完成了）、`PROMPTPAY_ID`、`CRON_SECRET`、
`ADMIN_SESSION_SECRET`、`SEED_ADMIN_PASSWORD`、LINE 三项。每一项的用途见 `CREDENTIALS.md` §2。

```bash
OMISE_PUBLIC_KEY="pkey_test_xxxxx"
OMISE_SECRET_KEY="skey_test_xxxxx"
```

保存文件。

> 注意：项目只用 Prisma 直连 PostgreSQL（`DATABASE_URL` + `DIRECT_URL`），
> 不需要 Supabase JS Client（anon key）。

---

## 第 3 步：安装依赖 & 生成 Prisma Client

在项目目录打开终端，运行：

```bash
npm install
```

> 这会自动触发 `postinstall` 脚本运行 `prisma generate`。看到 "Generated Prisma Client" 即成功。

---

## 第 4 步：推送数据库 Schema

```bash
npx prisma db push
```

预期输出：

```
🚀 Your database is now in sync with your Prisma schema.
```

> 本地开发才需要这一步。**生产库的 schema 变更要单独评估**，不要直接对 Neon 主库执行。
> 如果报错 `Can't reach database server`，检查网络与 `DIRECT_URL`。

---

## 第 5 步：播种数据库（种子数据）

```bash
export SEED_ADMIN_PASSWORD='<你设定的管理员口令>'   # 缺了会直接报错退出
npm run db:seed
```

预期输出：

```
🌱 Seeding database...
Creating ponds...
  ✅ 休闲塘 (30 spots, 100 THB/SLOT)
  ✅ 竞赛塘 (40 spots, 500 THB/DAY, min 10 participants)
Creating spots...
  ✅ 30 Leisure spots + 40 Competition spots = 70 total
Creating menu categories...
Creating menu items...
Creating admin user...
  ✅ Admin user (username: admin, role: SUPER_ADMIN)

🎉 Seed completed successfully!
```

> - 重复运行不会重复创建数据（用的是 upsert）。
> - ⚠️ 管理员用 `update: {}`，所以**重复 seed 不会重置已改过的口令**。
> - ⚠️ 生产环境（`NODE_ENV=production`）**必须**显式提供 `SEED_ADMIN_PASSWORD`，否则脚本抛错。

---

## 第 6 步：本地启动开发服务器

```bash
npm run dev
```

看到类似输出：

```
▲ Next.js 16.2.0
- Local: http://localhost:3000
✓ Ready in 2.3s
```

然后打开浏览器访问 **http://localhost:3000**

### 测试清单

| 页面 | 网址 | 预期结果 |
|------|------|----------|
| 首页 | http://localhost:3000/zh | 两个鱼塘卡片（休闲塘 + 竞赛塘） |
| 预约 | http://localhost:3000/zh/booking | 可切换两种塘，选择日期和钓位 |
| 菜单 | http://localhost:3000/zh/menu | 美食 / 饮品 / 钓具 tab 切换，菜品列表 |
| 购物车 | http://localhost:3000/zh/cart | 加购后可结算 |
| 订单 | http://localhost:3000/zh/orders | 登录后可见历史订单 |
| 个人中心 | http://localhost:3000/zh/profile | 登录弹窗 |
| 管理后台 | http://localhost:3000/zh/admin | 登录弹窗。**口令见 `CREDENTIALS.md`，不在本文档里** |

> 如果某个页面白屏或报错，按 F12 打开浏览器控制台看报错。

---

## 第 7 步：提交代码并推送

```bash
git add -A
git commit -m "…"
bash scripts/push-main.sh          # 三层凭据链，第一级成功即停
```

> ⚠️ 提交前有一道 `pre-commit` 密文闸门。若它拦下了你，**不要**用 `--no-verify`，
> 而是把口令移出仓库。真需要放行时用 `ALLOW_SECRETS=1`。
>
> 推送成功后 Vercel 会自动触发部署。**轮询时只盯 `Vercel – hook-fishpond-xi15`**
> （同仓库另挂着 3 个历史僵尸项目，永远 failure，会干扰判断）。

---

## 第 8 步：在 Vercel 设置环境变量

1. 打开 https://vercel.com/dashboard
2. 进入项目 **hook-fishpond-xi15**
3. **Settings → Environment Variables**
4. 按 `.env.example` 与 `CREDENTIALS.md` §2 逐项添加
   （**`DATABASE_URL` 等值只在这里填，不要写进仓库**）
5. 每个变量都要勾选 **Production + Preview + Development**
6. 全部添加完后 **Redeploy**

> 注意：Vercel 上的环境变量不会自动从 `.env.local` 读取，必须手动设置。
>
> ⚠️ 特别提醒 `ADMIN_SESSION_SECRET`：若不显式配置，代码会回退用 `DATABASE_URL` 当签名密钥
> —— 那样一旦重置数据库密码，**所有管理员会话会一起失效**。建议独立配置。

---

## 第 9 步：验证线上部署

等待 Vercel 重新部署完成（通常 2–3 分钟），然后访问：

- 主站：**https://hookfishpond.com**
- 旧地址（仍可达，但不应作为对外链接）：`https://hook-fishpond-xi15.vercel.app`

逐个测试：

1. ✅ 首页 — 两个鱼塘卡片正确显示
2. ✅ 预约页 — 休闲塘可选日期和钓位
3. ✅ 菜单页 — 菜品列表正确
4. ✅ 管理后台 — 能登录（口令见 `CREDENTIALS.md`）

### 线上回归清单（改动后必做）

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://hookfishpond.com/zh
node scripts/check-i18n.mjs --live --base https://hookfishpond.com
# 关键 API：无 cookie 应 401、非法入参应 400
# 安全响应头：CSP / X-Frame-Options / Referrer-Policy / Permissions-Policy
```

---

## 附录：常用命令速查

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动本地开发服务器 |
| `npx next build` | 构建生产版本 |
| `npx next start -p 3100` | 启动生产服务器（本地验证统一用 3100） |
| `npx tsc --noEmit` | 类型检查（必须 0 错） |
| `npm run check:i18n` | 三语键对齐 + 语言字符范围核验 |
| `npx prisma generate` | 重新生成 Prisma Client |
| `npx prisma db push` | 推送 schema 到数据库（仅本地） |
| `npx prisma db seed` | 播种数据（需 `SEED_ADMIN_PASSWORD`） |
| `bash scripts/push-main.sh` | 推送（三层凭据链） |

---

## 附录：管理员登录

- 用户名：`admin`
- 密码：**见 [`CREDENTIALS.md`](./CREDENTIALS.md) §1**（本文档不记录口令）

轮换口令：

```bash
node scripts/rotate-admin-password.mjs      # 交互式输入，永不打印
```

---

## 附录：数据库信息

| 项 | 当前位置 |
|---|---|
| 主库 | Neon（PostgreSQL），运行时经 Prisma 直连 |
| 冷备 | Supabase，每日 00:00（BKK）由 GitHub Actions 执行 `pg_dump` |
| 连接串 / 口令 | **见 [`CREDENTIALS.md`](./CREDENTIALS.md) §2**，绝不写进仓库 |
| 备份工作流 | `.github/workflows/db-backup.yml` |

---

## 附录：下一步开发计划

> 本节写于 2026-07，**已完成**，保留作为历史记录。

1. ~~接通 API~~ ✅ 前端已全部接真实 API
2. ~~Omise 支付~~ ⬜ 仍预留未接线；线上实际走 PromptPay
3. ~~手机 OTP 验证~~ ⬜ 方案已定（LINE Login + 官方账号收码），见 `otp-line-login-oa-plan.html`
4. ~~响应式优化~~ ✅
5. ~~性能优化~~ ✅ 图片懒加载、影片进视口才挂载

**当前的真实待办**看 `README.md` 的「开发状态」与 `local-growth-and-api-plan.html`。
