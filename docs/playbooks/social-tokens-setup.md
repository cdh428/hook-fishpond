# 社媒令牌获取速查（30 秒版）

> 更新日期：2026-10-04 · 适用 `C:/Users/dnlct/WorkBuddy/hook-fishpond`
> 原则：**令牌的值只进 `.env.local`（已 gitignore），绝不进仓库 / 日志 / 聊天记录。**

## LINE 官方账号（@300bsham）

| 项 | 值 | 获取方式 |
|---|---|---|
| 账号 | `@300bsham` | LINE Official Account Manager（chat.line.biz） |
| 权限 | Messaging API | 渠道已开通（`/api/cron/daily-report` 在用） |
| 令牌 | `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → 你的 Provider → Messaging API 渠道 → **Issue** → 选「永不过期」 |
| 密钥 | `LINE_CHANNEL_SECRET` | 同页面（仅 webhook 验签用，发广播不需要） |
| 视频预览 | `LINE_VIDEO_PREVIEW_URL` | 240×240 JPEG，公网可访问（本项目用 `https://hookfishpond.com/media/flood-preview-240.jpg`） |

**填入 `.env.local`**（只填键=值，值留空给你手填）：
```
LINE_CHANNEL_ACCESS_TOKEN=""
LINE_CHANNEL_SECRET=""
LINE_VIDEO_PREVIEW_URL="https://www.hookfishpond.com/media/flood-preview-240.jpg"
```

### 签发令牌的准确路径（2026-10-10 核对官方文档）

1. 打开 <https://developers.line.biz/console/> 登录 → 点进你的 **Provider**
2. 点进 **Messaging API 渠道**（就是对应 `@300bsham` 的那个）
3. 切到 **Messaging API** 标签页 → 滚到页面最下面
4. **Channel access token** 区块 → 点 **Issue（签发）**
   - 官方给四种令牌，**选 `Long-lived`（永不过期）**
   - ❌ 不要选 v2.1（user-specified expiration）—— 那个要用 JWT 现场生成，本项目不支持
5. 复制整串 → 粘进 `.env.local` 的 `LINE_CHANNEL_ACCESS_TOKEN=""` 里
6. 切到 **Basic settings** 标签页 → **Channel secret** → 复制 → 粘进 `LINE_CHANNEL_SECRET=""`
   （这个不是用来发消息的，是 webhook 验签；**没它 `/api/webhooks/line` 会直接拒绝请求**，
   采集不到顾客/群的 ID，日报就没有推送目标）

### 验证令牌（只读，绝不发消息）

```bash
node scripts/social/line-token-check.mjs
```

只调 LINE 的 GET 接口，**不会 push / broadcast / reply**，可以放心反复跑。它会依次报出：

| 步骤 | 看什么 |
|---|---|
| ① 账号身份 | 令牌是否有效、显示名称、是不是 `@300bsham`、Bot UserId |
| ② 推送配额 | 本月套餐上限 + 已用条数 |
| ③ Webhook 配置 | 已填的 webhook 地址 + 是否启用 |
| ④ Channel Secret | 是否配置 |

⚠️ **Webhook 地址要用 `https://www.hookfishpond.com/api/webhooks/line`**（带 www）。
现在 apex `hookfishpond.com` 会 308 跳到 www，而 LINE 的 webhook 是 **POST**，
重定向可能不被跟随 → 收不到事件、采集不到 userId。改完在控制台点 **Verify** 应显示 Success。

## Facebook / Instagram（Hookhappyness）

> ✅ **已验证（2026-10-04）**：主页 URL = `https://www.facebook.com/profile.php?id=61591042746753`
> → `FB_PAGE_ID = 61591042746753`（已从 `fb://profile/` 深链接读得，`.env.local` 已填）。
>
> ⚠️ **2026-10-07 改**：`META_PAGE_TOKEN` 改用 **Meta 系统用户永不过期令牌**（旧"用户令牌 60 天换主页令牌"方案作废）。
> 完整网页操作步骤见 **`docs/playbooks/meta-system-user-setup.md`**（约 15 分钟，纯网页操作，无需代码）。

| 项 | 值 | 获取方式 |
|---|---|---|
| FB 主页 | `https://www.facebook.com/profile.php?id=61591042746753` | Meta Business Suite |
| FB 主页 ID | `61591042746753` | URL 里的 `?id=`（**已填入 `.env.local`**） |
| IG 账号 | 需**商家/创作者**且**绑定 FB 主页** | IG 设置 → 账号类型和工具 |
| Meta App | 类型 Business，添加 **Instagram Graph API** 产品 | developers.facebook.com → Create App |
| 权限 | `instagram_business_basic` / `instagram_business_content_publish` / `instagram_manage_comments`（可选） | App Dashboard → 权限勾选 |
| 主页令牌 | `META_PAGE_TOKEN` | **系统用户永不过期令牌**（2026-10-07 改）：Business Manager → 系统用户 → 生成令牌；详见 `playbooks/meta-system-user-setup.md`（旧"用户令牌 60 天换主页令牌"方案已作废） |
| 主页 ID | `FB_PAGE_ID` | 同上一步返回里 `id` 字段 |
| IG 用户 ID | `IG_USER_ID` | 主页字段 `instagram_business_account.id` |

**填入 `.env.local`**（`FB_PAGE_ID` 已填好；`META_PAGE_TOKEN` 按 `meta-system-user-setup.md` §3.4 生成系统用户令牌后填入）：
```
META_PAGE_TOKEN=""          # ← 待填（Meta 系统用户永不过期令牌）
FB_PAGE_ID="61591042746753" # ✅ 已填
IG_USER_ID=""               # 仅 IG 需要
```

## 一键推送（配完令牌后）

```bash
# 先预演（不真发）
node scripts/publish/push-media.mjs \
  --media-url https://hookfishpond.com/media/bangkok-fishpond-final.mp4 \
  --caption "🎣 曼谷淹水？鱼塘照常开！" --dry-run

# 真推（默认带人工确认闸门）
node scripts/publish/push-media.mjs \
  --media-url https://hookfishpond.com/media/bangkok-fishpond-final.mp4 \
  --caption "🎣 曼谷淹水？鱼塘照常开！"

# 只发 LINE / 只发 FB
  ... --line-only
  ... --facebook-only
```

## 排错

| 现象 | 原因 / 解法 |
|---|---|
| `❌ missing token` | 对应令牌没填进 `.env.local` |
| LINE HTTP 401 | 令牌过期/未 Issue，重新 Issue |
| FB HTTP 190 / 200 | 权限不足，Meta App Dashboard 检查 `pages_manage_posts` / `instagram_business_content_publish` |
| IG 容器 90s 未就绪 | 网络抖动或额度限，脚本已报超时；容器 24h 内可手动补发 |
| `LINE_VIDEO_PREVIEW_URL` 未配置 | 视频消息会缺预览图，LINE 端显示默认占位 |
