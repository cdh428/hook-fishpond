# 顾客认证（LINE Login）—— 实现契约与坑

> 2026-11-17 上线方案②主通道。方案全文（为什么这么做）：`docs/archive/otp-line-login-oa-plan.html`。
> 本文档是**改代码前必读的实现契约**：改动任何一处前先读完，别凭印象重造。

## 一、架构一览

```
profile 页「用 LINE 继续」
  → GET /api/auth/line/start?locale=xx     302 → LINE 授权页（bot_prompt=aggressive
                                            顺带引导加 @300bsham 好友）
  → 用户授权 → LINE 回跳 GET /api/auth/line/callback?code&state
  → 验 state（HMAC cookie）→ code 换 token → userinfo 拿 sub（= LINE userId）
  → 按 lineUserId upsert User → 下发顾客会话 cookie → 302 回 /{locale}/profile
```

- **channel**：LINE Login，ID 在 `.workbuddy/secrets/line-login.env` 与 `.env.local`；
  env 键 `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET`（Vercel 上也要配，本机无 Vercel 凭据只能用户网页加）。
- **redirect_uri** = `${NEXT_PUBLIC_BASE_URL}/api/auth/line/callback`。生产必须是 **www 域名**
  （apex 308 对浏览器跳转虽能跟随，但 LINE 侧登记与代码必须逐字一致）。
- **兜底通道（方案④聊天短码）尚未实现** —— webhook 处理顾客短码是独立一期，别以为已经做了。

## 二、会话契约（src/lib/auth.ts）

- 顾客与管理员共用同一套 HMAC 签名，**payload 里的 `k` 字段隔离**：`admin` / `cust`。
  验签时按期望 kind 校验 —— 顾客 token 冒充管理员直接失败，反之亦然。
  ⚠️ 2026-11-17 起无 `k` 的旧 token 一律失效（管理员需重登一次，预期行为）。
- cookie：`hf-user-session`（httpOnly, lax, 7 天）。**前端拿不到值**，改不了 payload。
- `getUserFromRequest`：cookie 优先；**`x-user-id` 头是兼容期回退**（可伪造的旧机制）。
  兼容期结束时要删掉这条回退 —— 删之前先确认所有顾客端都走过一次 LINE 登录。
- 通用的 `signRaw` / `verifyRaw` 供 state 等其他签名复用，别再写第二份 HMAC。

## 三、实现要点（照抄即可，别改设计）

1. **state**：HMAC 签名短时 cookie（10 分钟），CSRF 防护 = 「LINE 回传的 state === cookie 里的 state」
   且验签 + 过期。一次性：成功后 delete。
2. **拿身份用 userinfo 端点**（`GET /api.line.me/oauth2/v2.1/userinfo`），**不要本地解析 id_token**
   —— 省掉 RS256 公钥轮换验签。token 是我们用 secret 换的，走 HTTPS，足够安全。
3. **换 token 必须用 `application/x-www-form-urlencoded`**（OAuth 规范），JSON 会 400。
4. **callback 错误一律 302** 回 `/{locale}/profile?lineError=<code>`，前端按 code 出本地化文案
   （`authLine.err*`）。不在服务端渲染错误页 —— 这里是浏览器跳转，回页面最自然。
   错误码集合：`notConfigured / expired / invalidState / tokenFailed / profileFailed / tooMany`。
5. **locale 放进 state cookie**（`issueState(locale)`），callback 从中解析回跳语言；
   前端 profile 页用 `window.location.search` 读参数（**不要用 `useSearchParams`**，
   静态页会触发 CSR bailout 的 Suspense 构建约束），读完 `history.replaceState` 清掉。
6. **LINE 用户没有手机号**（要 OC_PHONE_NUMBER 得 Certified Provider + 盾，这次不做）：
   `User.phone` 已改可空、`lineUserId` 唯一可空。手机号从「身份」降级为「自愿填的联系方式」。

## 四、踩过的坑 / 判断过的坑（别重蹈）

- **Prisma 7 不能裸 `new PrismaClient()`**（要 driver adapter）——一次性验证脚本必须
  照抄 `src/lib/prisma.ts` 的构造方式，否则 `PrismaClientInitializationError`。
- **`db push` 加 unique 约束会要 `--accept-data-loss`**。判断能不能放行：现有数据全 null
  （PG 允许多个 NULL）→ 安全放行；已有重复值 → 先清洗再 push。
- **`db push` 之后必须 `npx prisma generate`**，否则 tsc 报新字段不存在。
- **redirect_uri 与 LINE 控制台登记必须逐字一致**（协议+域名+路径），差一个字 LINE 直接
  `invalid_request`。本地 localhost 回调没登记时，本地只能测到「302 出去」，
  端到端必须上生产域名测。
- **profile 页有两个登录入口**（未登录大按钮 + 弹窗内），改按钮时**两处都要改**，
  而且别把手机号提交按钮改丢（2026-11-17 实际改丢过一次，靠回读 diff 发现）。

## 五、验收清单（上线/改动后逐条跑）

- [ ] `npx tsc --noEmit` = 0；`npm run check:i18n` 全绿；`next build` EXIT=0
- [ ] `/api/auth/line/start` → 302 到 `access.line.me`，带 `bot_prompt=aggressive` 与 state cookie
- [ ] `/api/auth/line/callback`（伪造 state）→ 302 回 `?lineError=invalidState`，语言跟随
- [ ] 生产端到端一次：真实 LINE 授权 → 回跳 → cookie 下发 → `/api/auth/me` 返回带 `lineUserId` 的 User
- [ ] 伪造会话 cookie → 401；A 的会话查 B 的订单 → 拿不到（等 x-user-id 回退删除后补强测试）
- [ ] 短码兜底通道（方案④）实现后：同码二用失败、5 分钟过期、跨浏览器票据不可偷会话
