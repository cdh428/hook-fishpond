# Hook Fishpond — 运行指南

> 按顺序完成以下步骤，每步完成后再进行下一步。
> 遇到问题随时截图给我看。

---

## 第 1 步：获取 Omise 支付密钥

1. 打开 https://dashboard.omise.co/
2. 注册/登录你的 Omise 账号
3. 左侧菜单点击 **Keys**
4. 你会看到两组密钥：
   - **Test** 模式：`pkey_test_...` 和 `skey_test_...`
   - **Live** 模式：`pkey_live_...` 和 `skey_live_...`
5. 现在先用 **Test** 模式的密钥（上线后再换 Live）
6. 把 `pkey_test_...` 和 `skey_test_...` 记下来

> 如果你还没有 Omise 账号，可以先跳过这步，支付功能暂时不用。其他功能（浏览、预约、菜单）不受影响。

---

## 第 2 步：更新本地 .env.local 文件

用编辑器打开 `D:\Github\hook-fishpond\.env.local`。

当前内容已经正确配置了数据库连接，只需填入 Omise 密钥（如果第 1 步完成了）：

找到这两行：
```
OMISE_PUBLIC_KEY="<YOUR-OMISE-PUBLIC-KEY>"
OMISE_SECRET_KEY="<YOUR-OMISE-SECRET-KEY>"
```
改为：
```
OMISE_PUBLIC_KEY="pkey_test_xxxxx"
OMISE_SECRET_KEY="skey_test_xxxxx"
```

保存文件。

> 注意：项目只用 Prisma 直连 PostgreSQL（DATABASE_URL + DIRECT_URL），不需要 Supabase JS Client（anon key），已从配置中删除。

---

## 第 3 步：安装依赖 & 生成 Prisma Client

在项目目录 `D:\Github\hook-fishpond` 打开终端（PowerShell 或 CMD），运行：

```bash
npm install
```

等待安装完成（可能需要 1-2 分钟）。

> 这会自动触发 `postinstall` 脚本运行 `prisma generate`。如果看到绿色文字 "Generated Prisma Client" 说明成功。

---

## 第 4 步：推送数据库 Schema 到 Supabase

在终端运行：

```bash
npx prisma db push --accept-data-loss
```

你会看到类似这样的输出：
```
🚀 Your database is now in sync with your Prisma schema.
```

> 这一步用直连端口 5432 连接 Supabase，创建/更新所有表。`--accept-data-loss` 是因为 V2 删除了旧的 Zone 表。
> 如果报错 `Can't reach database server`，检查网络连接和 .env.local 中的 DIRECT_URL。

---

## 第 5 步：播种数据库（种子数据）

在终端运行：

```bash
npm run db:seed
```

成功输出：
```
🌱 Seeding database...
Creating ponds...
  ✅ 休闲塘 (30 spots, 100 THB/SLOT)
  ✅ 竞赛塘 (40 spots, 500 THB/DAY, min 10 participants)
Creating spots...
  ✅ 30 Leisure spots + 40 Competition spots = 70 total
Creating menu categories...
  ✅ 5 categories
Creating menu items...
  ✅ 19 menu items
Creating admin user...
  ✅ Admin user (username: admin, role: SUPER_ADMIN)

🎉 Seed completed successfully!

📊 Database summary:
   Ponds: 2
   Spots: 70
   Categories: 5
   Menu Items: 19
   Admin Users: 1
```

> 如果再次运行 seed，不会重复创建数据（使用了 upsert）。

---

## 第 6 步：本地启动开发服务器

在终端运行：

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

### 测试清单：

打开每个页面，确认能正常显示：

| 页面 | 网址 | 预期结果 |
|------|------|----------|
| 首页 | http://localhost:3000/zh | 两个鱼塘卡片（休闲塘+竞赛塘） |
| 预约 | http://localhost:3000/zh/booking | 可切换两种塘，选择日期和钓位 |
| 菜单 | http://localhost:3000/zh/menu | 美食/饮品 tab 切换，菜品列表 |
| 购物车 | http://localhost:3000/zh/cart | 有 demo 数据 |
| 订单 | http://localhost:3000/zh/orders | 有 demo 数据 |
| 个人中心 | http://localhost:3000/zh/profile | 登录弹窗 |
| 管理后台 | http://localhost:3000/zh/admin | 登录弹窗，输入 admin / Admin@2026 |

> 如果某个页面白屏或报错，按 F12 打开浏览器控制台，截图给我。

---

## 第 7 步：提交代码并推送

在终端运行：

```bash
git add -A
git commit -m "Remove unused Supabase client keys, update env config"
git push
```

> 这会把代码推送到 GitHub (cdh428/hook-fishpond)，Vercel 会自动触发重新部署。

---

## 第 8 步：在 Vercel 设置环境变量

1. 打开 https://vercel.com/dashboard
2. 找到 **hook-fishpond** 项目，点击进入
3. 顶部菜单点击 **Settings**
4. 左侧菜单点击 **Environment Variables**
5. 逐个添加以下变量（点 "Add New" 按钮）：

| Key | Value | 说明 |
|-----|-------|------|
| `DATABASE_URL` | `postgresql://postgres:Fishpond%402026@db.ehsmsjmmccliysxnkgpv.supabase.co:6543/postgres?pgbouncer=true` | 数据库连接池 |
| `DIRECT_URL` | `postgresql://postgres:Fishpond%402026@db.ehsmsjmmccliysxnkgpv.supabase.co:5432/postgres` | 数据库直连 |
| `NEXT_PUBLIC_BASE_URL` | `https://hook-fishpond-xi15.vercel.app` | 网站正式地址 |
| `OMISE_PUBLIC_KEY` | (第 1 步获取的 pkey_test_...) | Omise 公钥（没有就暂不加） |
| `OMISE_SECRET_KEY` | (第 1 步获取的 skey_test_...) | Omise 私钥（没有就暂不加） |

6. 每个变量添加时，Environment 选 **Production** + **Preview** + **Development**（全选）
7. 全部添加完后，点击页面上的 **Redeploy** 按钮

> 注意：Vercel 上的环境变量不会自动从 .env.local 读取，必须在这里手动设置。

---

## 第 9 步：验证线上部署

等待 Vercel 重新部署完成（通常 2-3 分钟）。

然后打开浏览器访问：**https://hook-fishpond-xi15.vercel.app**

逐个测试：

1. ✅ 首页 — 两个鱼塘卡片正确显示
2. ✅ 预约页 — 休闲塘可选时段和钓位
3. ✅ 菜单页 — 菜品列表正确
4. ✅ 管理后台 — 能登录 (admin / Admin@2026)

---

## 附录：常用命令速查

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器（先 build 再 start） |
| `npm run lint` | 代码检查 |
| `npx prisma generate` | 重新生成 Prisma Client |
| `npm run db:push` | 推送 schema 到数据库 |
| `npm run db:seed` | 播种数据 |

## 附录：管理员登录

- 用户名：`admin`
- 密码：`Admin@2026`

## 附录：数据库信息

- Supabase 项目：https://supabase.com/dashboard/project/ehsmsjmmccliysxnkgpv
- 连接池端口：6543 (运行时用)
- 直连端口：5432 (CLI 命令用)
- 数据库密码：`Fishpond@2026`

## 附录：下一步开发计划

当前前端页面使用的是**硬编码的演示数据**（demoBookings、demoOrders 等）。要让网站真正可用，还需要：

1. **接通 API** — 把前端页面的 mock 数据替换为调用 `/api/` 路由获取真实数据
2. **Omise 支付** — 在购物车页面接入真实的 Omise 支付流程
3. **手机 OTP 验证** — 用户注册时发送短信验证码
4. **响应式优化** — 确保 PC / 安卓 / iOS 都有良好体验
5. **性能优化** — 图片懒加载、API 缓存、并发处理
