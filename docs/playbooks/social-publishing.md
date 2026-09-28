> **这是权威版本。** 项目里的同名 skill 只保留触发入口，正文以本文件为准。
> `.workbuddy/` 被 `.gitignore` 忽略，知识只存在本机 —— 流程必须跟着代码走。
> 已脱敏：本文件只写「去哪拿令牌」，**绝不记录任何令牌的值**。
> 创建日期：2026-09-28。上游参考：`docs/local-growth-and-api-plan.html`（肆/伍两节）。

# Hook Fishpond · 社媒发布与定时排期（Facebook / Instagram / LINE）

## 什么时候用

- 要把渔获照片、活动、促销发到 **FB 主页 / Instagram / LINE 官方账号**
- 要把发帖从「手工手机点」升级成「一键命令」甚至「定时自动」
- 令牌过期（约 60 天）需要续期

**现状（2026-09-28）**：三渠道的令牌**均未配置**。第一期目标是把下面「一次性准备」做完，
让 `scripts/social/fb-ig-post.mjs` 和 `scripts/social/line-broadcast.mjs` 能真正跑起来。

---

## 三个渠道一览

| 渠道 | 资产 | 发帖方式 | 脚本 | 令牌 |
|---|---|---|---|---|
| Facebook 主页 | `facebook.com/Hookhappyness` | Graph API `/{page-id}/photos` | `scripts/social/fb-ig-post.mjs` | `META_PAGE_TOKEN`（主页令牌） |
| Instagram | 需**专业账号**且**绑定 FB 主页** | Graph API 两步容器（见下） | 同上（`--ig-only`） | 同上 + `IG_USER_ID` |
| LINE 官方账号 | `@300bsham` | Messaging API broadcast | `scripts/social/line-broadcast.mjs` | `LINE_CHANNEL_ACCESS_TOKEN`（**已有**，日报在用） |

> LINE 的令牌已配置（`/api/cron/daily-report` 在用同一个），所以 LINE 广播今天就能跑；
> Meta 两个渠道要等「一次性准备」做完。

---

## 一次性准备（Meta，约 30 分钟，都是网页操作）

1. **IG 切专业账号**：IG 设置 → 账号类型和工具 → 切换为**商家**或**创作者**。
2. **IG 绑定 FB 主页**（最容易漏的一步）：IG 专业账号设置里把 Linked Facebook Page 指到
   `Hookhappyness`。Meta 的权限体系走 FB 主页，没绑就发不了 IG。
3. **建 Meta 应用**：developers.facebook.com → Create App（类型 Business）→
   添加 **Instagram Graph API** 产品；权限勾
   `instagram_business_basic` / `instagram_business_content_publish`
   （想自动发首条评论带话题标签再加 `instagram_manage_comments`）。
   只操作自己名下资产 → **Standard Access** 即可，不用提交 App Review。
4. **拿令牌**：
   - Graph API Explorer 拿**短期** user token（勾上面三个权限）；
   - 换**长期** user token（约 60 天）：
     `GET https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<短期令牌>`
   - 再换**主页令牌**：`GET /v23.0/me/accounts`（带长期 user token）→ 取 `Hookhappyness` 的
     `access_token`。**主页令牌不过期**（除非改密码/撤销授权），这是要存的那一个。
5. **取两个 ID**（同一步的返回里就有）：
   - `FB_PAGE_ID` = 主页对象 id；
   - `IG_USER_ID` = 主页字段 `instagram_business_account.id`
     （`GET /v23.0/<FB_PAGE_ID>?fields=instagram_business_account`）。
6. **存放**：本机 `.env.local` + Vercel 环境变量。**绝不写进仓库、聊天记录、截图。**
   字段名见 `.env.example` 的 Meta 段。

---

## 一键发帖（第一期）

```bash
# 图必须是线上可公网访问的 URL（Meta 服务器自己来抓），且只支持 JPEG ≤8MB。
# 网站素材都在 https://hookfishpond.com/media/ 下（WebP 不可用于 IG，先转 JPG 入库）。
node scripts/social/fb-ig-post.mjs \
  --image-url https://hookfishpond.com/media/hero-01-sunset.jpg \
  --caption-file caption.txt          # 文案 ≤2200 字符；--dry-run 先预演

node scripts/social/fb-ig-post.mjs --image-url ... --caption-file ... --ig-only
node scripts/social/fb-ig-post.mjs --image-url ... --caption-file ... --fb-only
```

行为与限制（脚本已实现/已校验）：

| 项 | 规则 |
|---|---|
| IG 发帖流程 | **两步容器**：`POST /{ig}/media` 建容器 → 轮询 `status_code=FINISHED` → `POST /{ig}/media_publish`。容器 24h 不 publish 会过期 |
| 图片格式 | **只支持 JPEG**（PNG/WebP/GIF 被拒）；1:1 (1080×1080) / 4:5 (1080×1350) / 1.91:1；≤8MB |
| 文案 | ≤2200 字符；前 125 字是「展开」前可见部分；话题标签 ≤30 个 |
| 频率上限 | IG 每 24h 100 条、每小时 200 次**调用**（额度紧，别写轮询密集的逻辑）；FB 主页每天约 25 条 |
| 失败表现 | 建容器返回 200 ≠ 发出去了 —— 必须等 FINISHED；脚本已内置轮询与超时报错 |

### LINE 广播

```bash
node scripts/social/line-broadcast.mjs --text-file broadcast.txt --dry-run   # 先预演
node scripts/social/line-broadcast.mjs --text-file broadcast.txt
```

- 发给**所有加过官方账号的好友**（`/v2/bot/message/broadcast`），单条文本 ≤5000 字符。
- 频率克制：这是「一对一通知」的通道，也是日报通道 —— **每周至多 1–2 条**营销信息。

---

## 定时发布（第二期，三选一）

| 方案 | 做法 | 评价 |
|---|---|---|
| **A. 后台「📣 发帖」页 + Vercel Cron（推荐，正式方案）** | `POST /api/admin/social/post`（计划文档已设计）：后台选 `public/media/` 图 + 三语文案 → 写入发布队列表 → Vercel Cron 到点调 Graph API；**同一条 cron 每 45 天续期令牌**，失败给管理员推 LINE | 令牌续期闭环、店员在后台就能用；需要写代码，第二期做 |
| B. GitHub Actions cron | 定时跑 `fb-ig-post.mjs`（令牌放 Actions Secrets） | 内容必须先提交进仓库（public），操作别扭；令牌续期没人盯 |
| C. 本机 WorkBuddy 定时任务 | 定时让 AI 生成三语文案 + 调脚本 | 依赖本机开机；适合「每周草稿包」而非准点发布 |

> ⚠️ **令牌续期是自动化的生死线**：长期 user token 60 天过期，到期整个链路「无声失效」。
> 方案 A 把续期挂进 cron 并带 LINE 告警；在方案 A 落地前，**日历上每 50 天人工换一次令牌**。

---

## 文案与内容流水线

- 素材：`docs/playbooks/media-pipeline.md` 产出的 `public/media/` 成品直接复用（发 IG 前确认 JPG 版本在）。
- 三语文案：**同一事实、三语各自成段**（zh / en / ไทย 三段并列），不要混排在同一句话里。
  泰文别用机器直译的「你们」腔，用泰国钓鱼圈常用说法。
- 品牌名：官方名暂定 **Hook Happyness**（泰文别名 ฮุค เดอะ แฮปปี้เนส），
  ⚠️ 待实体招牌确认后统一 —— 现在四个渠道写法不一致，正是 Google 重复资料的成因之一。
- 发布前自查：图里有没有客人正脸（隐私）、价格是否与网站一致（**以网站口径为准**）、
  营业时间/休息日没写错（周一固定休息）。

## 安全铁律

1. 令牌的值**只**存在 `.env.local` / Vercel env（第二期起 Actions Secrets）。
2. 脚本输出**永不打印令牌**；报错贴给别人看之前先检查有没有 `access_token=...` 字样。
3. 换令牌 = Meta 应用侧撤销授权重新走一遍「一次性准备」；同时更新 `.env.local` 与 Vercel。
4. 本文件只写「去哪拿」，任何令牌的值出现在仓库里 = 立即轮换（见 `CREDENTIALS.md` §0 铁律）。
