# Hook Fishpond · 一次性人工配置清单（网页操作）

> 更新日期：2026-10-06 · 适用工作目录 `C:\Users\dnlct\WorkBuddy\hook-fishpond`
>
> 本文件是「**必须人工在网页/本机做一次、之后 AI 才能接管自动跑**」的精确操作指引。
> 做完对应项后，AI 侧的脚本/工作流就能直接跑，无需重复配置。
>
> 已完成项打勾，未完成的按步骤做。

---

## A. 数据库冷备 Secrets（GitHub Actions）

**用途**：`db-backup.yml` 每日 00:00（曼谷）把 Neon 主库 `pg_dump` 到 Supabase 冷备。
**现状**：两个 Secret 都不存在（`total_count: 0`），备份 11 连败的根因。

### 步骤（约 5 分钟）

1. 打开仓库 → **Settings → Secrets and variables → Actions**
   `https://github.com/cdh428/hook-fishpond/settings/secrets/actions`
2. 点 **New repository secret**，分别建两条：

   | Secret 名 | 值（来源） |
   |---|---|
   | `NEON_DATABASE_URL` | Neon Dashboard → 项目 → **PSQL**（Direct Connection）复制连接串，末尾加 `?sslmode=require` |
   | `SUPABASE_DATABASE_URL` | Supabase → Settings → Database → **Connection string**（URI）复制 |

   ⚠️ 值里**必须带合法 `sslmode=require`**（libpq 只认 6 个值；曾错用 `no-verify` 导致 `pg_dump` 直接退出）。
   ⚠️ **建完务必轮换连接串口令**（`docs/CREDENTIALS.md` §5 已记录：这两串在 git 历史里明文存在过）。

3. **手动跑一次验证**（不要只等定时）：
   Actions → **Database Backup (Neon → Supabase)** → **Run workflow** → 勾 main → 点 green ▶
   - 看结果 `conclusion: success` 才算真通了（历史 11 次全败没人发现，就是只等定时没手动验证）。
   - 失败会显式报 `仓库 Secrets 缺失: …`，不用翻日志猜。

4. （可选）本地应急手动跑一次（不进 CI）：
   ```bash
   export NEON_DATABASE_URL="postgresql://<user>:<pass>@<neon-host>.aws.neon.tech/neondb?sslmode=require"
   export SUPABASE_DATABASE_URL="postgresql://postgres:<pass>@db.<project-ref>.supabase.co:5432/postgres"
   node scripts/backup-neon-to-supabase.js
   ```

**做完了？** 在 `db-backup.yml` 运行历史里看到一次 `success`，即可把本项打勾。

---

## B. 社媒令牌（LINE 官方账号 + Meta Graph API）

**用途**：`scripts/publish/push-media.mjs` / `scripts/social/*` 一键推送视频/图文到 LINE OA 和 FB 主页。
**现状**：`.env.local` 里 `LINE_CHANNEL_ACCESS_TOKEN`、`META_PAGE_TOKEN` 都是空值，脚本跑不出。

### B1. LINE 官方账号（@300bsham）

1. 打开 **LINE Developers**：`https://developers.line.biz/console/`
2. 选 Provider（含 @300bsham 那个）→ **Messaging API 渠道** → **Issue channel access token**
   - Token type: **Long-lived**（永久）
   - Scope: 默认即可
3. 复制 token，填进 **本机** `C:\Users\dnlct\WorkBuddy\hook-fishpond\.env.local`：
   ```
   LINE_CHANNEL_ACCESS_TOKEN="<刚才复制的>"
   ```
   ⚠️ **绝不进 git / 仓库 / 日志 / 聊天**（`.env.local` 已 gitignore）。
4. 视频消息需预览图，`.env.local` 已有：
   `LINE_VIDEO_PREVIEW_URL="https://hookfishpond.com/media/flood-preview-240.jpg"`
5. **验证**（本机）：
   ```bash
   node scripts/social/line-broadcast.mjs --text "测试" --dry-run
   # 去掉 --dry-run 才真发
   ```

### B2. Facebook / Instagram（Hookhappyness）

**已验证**：FB 主页 ID = `61591042746753`（`.env.local` 已填 `FB_PAGE_ID`）。

1. **IG 切专业账号**（若做 IG）：IG 设置 → 账号类型和工具 → 商家/创作者
2. **IG 绑定 FB 主页**（最容易漏）：IG 专业账号设置 → Linked Facebook Page → 指到 `Hookhappyness`
3. **建 Meta 应用**：`https://developers.facebook.com/` → Create App（类型 **Business**）→ 添加 **Instagram Graph API**
   - 权限勾 `instagram_business_basic` / `instagram_business_content_publish`
   - 只操作自己名下资产 → **Standard Access**，不用 App Review
4. **拿主页令牌（长期、不过期）**：
   - Graph API Explorer 拿短期 user token（勾上面权限）
   - 换长期 user token（约 60 天）：
     `GET https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<短期令牌>`
   - 再换**主页令牌**：`GET /v23.0/me/accounts`（带长期 user token）→ 取 `Hookhappyness` 的 `access_token`
   - 同时拿到 `FB_PAGE_ID`（已填）和 `IG_USER_ID`（主页字段 `instagram_business_account.id`）
5. 填进 **本机** `.env.local`：
   ```
   META_PAGE_TOKEN="<主页令牌>"
   IG_USER_ID="<IG 业务账号 ID>"
   ```
   ⚠️ 主页令牌**基本不过期**（改密码/撤销授权才失效）——这是要长期存的那一个。
6. **验证**（本机）：
   ```bash
   node scripts/social/fb-ig-post.mjs \
     --image-url https://hookfishpond.com/media/hero-01-sunset.jpg \
     --caption "test" --fb-only --dry-run
   ```

**做完了？** 在 `.env.local` 里 `LINE_CHANNEL_ACCESS_TOKEN` 与 `META_PAGE_TOKEN` 都有非空值，脚本 `--dry-run` 不再报 `missing token`，即可打勾。

---

## C. LINE Video 预览图上传（可选，若 LINE 视频要带缩略图）

1. 确认 `public/media/flood-preview-240.jpg` 已提交进 git（已做）。
2. 推 main → Vercel 自动部署 → `https://hookfishpond.com/media/flood-preview-240.jpg` 返回 200。
3. `LINE_VIDEO_PREVIEW_URL` 指向该公网 URL（`.env.local` 已配）。

---

## 一键推送（配完 A/B 后）

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

---

## 状态速查

| 项 | 状态 | 完成后动作 |
|---|---|---|
| A. DB 冷备 Secrets | ⬜ 未建 | 建 2 个 Secret → 手动 Run workflow → 看 success |
| B1. LINE token | ⬜ 未配 | LINE Developers Issue → 填 `.env.local` → dry-run |
| B2. Meta 令牌 | ⬜ 未配 | 建 App 拿主页令牌 → 填 `.env.local` → dry-run |
| C. LINE 视频预览图 | ✅ 已提交 | 推 main 后确认公网 200 |
| FB_PAGE_ID | ✅ 已填 `61591042746753` | — |

> 关联权威源：`docs/CREDENTIALS.md` §3（Secrets 详情）· `docs/playbooks/deploy-and-backup.md` §3（备份 Runbook）· `docs/playbooks/social-tokens-setup.md`（令牌 30 秒速查）· `docs/playbooks/social-publishing.md`（社媒发帖全流程）
