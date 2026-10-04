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
LINE_VIDEO_PREVIEW_URL="https://hookfishpond.com/media/flood-preview-240.jpg"
```

## Facebook / Instagram（Hookhappyness）

| 项 | 值 | 获取方式 |
|---|---|---|
| FB 主页 | `facebook.com/Hookhappyness` | Meta Business Suite |
| IG 账号 | 需**商家/创作者**且**绑定 FB 主页** | IG 设置 → 账号类型和工具 |
| Meta App | 类型 Business，添加 **Instagram Graph API** 产品 | developers.facebook.com → Create App |
| 权限 | `instagram_business_basic` / `instagram_business_content_publish` / `instagram_manage_comments`（可选） | App Dashboard → 权限勾选 |
| 主页令牌 | `META_PAGE_TOKEN` | Graph API Explorer 短期 → 换长期（60 天）→ `GET /me/accounts` 取 `Hookhappyness` 的 `access_token` |
| 主页 ID | `FB_PAGE_ID` | 同上一步返回里 `id` 字段 |
| IG 用户 ID | `IG_USER_ID` | 主页字段 `instagram_business_account.id` |

**填入 `.env.local`**：
```
META_PAGE_TOKEN=""
FB_PAGE_ID=""
IG_USER_ID=""
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
