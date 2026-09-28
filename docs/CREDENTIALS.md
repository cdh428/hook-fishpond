# 凭据清单（Credential Registry）

> **本文件只记录「哪个系统 / 谁持有 / 去哪改」，绝不记录任何口令、Token、连接串的值。**
> 本仓库是 **public** —— 任何写进这里的值都等于公开发布。

最后更新：2026-09-28

---

## 0. 三条铁律

1. **值不进仓库。** 凭据的值只允许存在于三个地方：
   本机 `.env.local`、Vercel 环境变量、GitHub Actions Secrets。
2. **旧文档里出现过的口令 = 已泄漏。** 必须轮换；删掉那行字**不算修复**（口令仍在 git 历史里）。
3. **轮换任何凭据后，同步更新「引用点」列里的所有位置**，否则会出现静默失败。

> ⚠️ **第 3 条不是理论。** 2026-09-28 实测发现：每日冷备 `db-backup.yml`
> 从建立（2026-09-17）起 **11 次运行全部失败**，且**从未有人发现**（见 §5）。
> 「有没有在跑」必须有人看，靠假设是不行的。

> 因为本仓库公开，这里刻意不写系统内部细节。若将来仓库转为 private，可以补充更多。

---

## 1. 系统账号

| # | 系统 | 入口 | 账号（仅用户名） | 谁持有 | 去哪改 / 轮换 |
|---|---|---|---|---|---|
| 1 | 官网管理后台 | `https://hookfishpond.com/zh/admin` | `admin`（SUPER_ADMIN） | 店主 + 现场店长 | 本机跑 `node scripts/rotate-admin-password.mjs`（**永不打印**），改完通知店员 |
| 2 | 顾客端账号 | 网站「个人中心」 | 手机号注册 | 顾客自己 | 顾客自助 |
| 3 | GitHub 仓库 | github.com/cdh428/hook-fishpond | `cdh428` | 店主 | github.com/settings |
| 4 | Vercel | vercel.com | 用 GitHub 账号登录 | 店主 | vercel.com/account |
| 5 | 域名 `hookfishpond.com` | 注册商 AWN (`awn.co.th`) | — | 店主 | 注册商后台（DNS 指向 Vercel） |
| 6 | Neon（**主库**，运行时唯一数据源） | console.neon.tech | — | 店主 | Neon → Project → Roles / Passwords |
| 7 | Supabase（**冷备**，每日 pg_dump 目标） | supabase.com/dashboard | — | 店主 | Supabase → Settings → Database → **Reset database password** |
| 8 | LINE 官方账号 | chat.line.biz | `@300bsham` | 店主 | LINE Official Account Manager |
| 9 | Google 商家资料 | business.google.com | — | 店主 | ⚠️ 当前存在**重复资料**，见 `local-growth-and-api-plan.html` |
| 10 | Facebook 主页 | facebook.com/Hookhappyness | — | 店主 | Meta Business Suite |

---

## 2. 环境变量清单（只有名字与用途，模板见根目录 `.env.example`）

本地 `.env.local` 与 Vercel 生产环境应保持一致。

| 变量 | 用途 | 轮换方式 |
|---|---|---|
| `DATABASE_URL` | Neon 主库连接串（运行时） | Neon 控制台重置角色密码 |
| `DIRECT_URL` | Neon 直连串（CLI / 迁移用） | 同上 |
| `SUPABASE_DATABASE_URL` | 冷备目标连接串。**只有备份脚本用，CI 里跑** | Supabase 重置数据库密码 ⚠️ 见 §5 |
| `NEXT_PUBLIC_BASE_URL` | 站点绝对 URL 前缀（canonical / og / 分享链接） | 固定为 `https://hookfishpond.com` |
| `ADMIN_SESSION_SECRET` | 管理员会话 HMAC 签名密钥 | `openssl rand -base64 32`。**换掉它 = 一次性踢掉所有管理员会话**（应急手段） |
| `SEED_ADMIN_PASSWORD` | 仅 `prisma db seed` 读取；生产缺失即报错退出 | 与后台口令保持一致 |
| `PROMPTPAY_ID` | 商家 PromptPay 收款号（手机号或 13 位税号） | 银行侧变更后同步 |
| `PROMPTPAY_MERCHANT_NAME` | 收款方显示名 | 同上 |
| `CRON_SECRET` | Vercel Cron 调 `/api/cron/*` 的 `Authorization: Bearer` 鉴权 | `openssl rand -base64 32` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 推送（每日日报） | LINE Developers → Messaging API 渠道 |
| `LINE_CHANNEL_SECRET` | LINE webhook 验签 | 同上 |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | 顾客 OTP（待接入） | LINE Login 渠道，⚠️ **必须与 Messaging 渠道同一 Provider** |
| `OMISE_PUBLIC_KEY` / `OMISE_SECRET_KEY` | Omise 支付（接口已预留，未接线） | Omise Dashboard |
| `OMISE_WEBHOOK_SECRET` | Omise 回调鉴权；缺失则接口返回 503 | 自定义随机串 |

> 💡 `SUPABASE_DATABASE_URL` **本机其实不需要**（备份在 CI 里跑）。
> 本机不存它，就少一处泄露面；真要手动跑备份时临时 `export` 即可。

---

## 3. GitHub Actions Secrets

仓库 → Settings → Secrets and variables → Actions → **New repository secret**

| Secret | 用途 |
|---|---|
| `NEON_DATABASE_URL` | 每日 `db-backup.yml` 的**读取源**（Neon 主库连接串） |
| `SUPABASE_DATABASE_URL` | 每日 `db-backup.yml` 的**写入目标**（Supabase 冷备连接串） |

> ❗ **实测（2026-09-28）：这两个 Secret 目前都不存在** ——
> `GET /repos/cdh428/hook-fishpond/actions/secrets` 返回 `total_count: 0`。
> 这就是备份 11 次全败的直接原因。**必须先把它们建出来**，备份才可能跑通。
>
> **为什么用 Secrets 而不是别的办法**：值只在 GitHub 侧加密保存（libsodium sealed box），
> 运行时才解密进 runner 的环境变量，日志里自动打码，仓库里、workflow 文件里都看不到值；
> 任何人和任何 AI 都不需要接触明文口令。这是「每天自动跑又不泄露口令」的标准答案。

> ⚠️ 改库口令却忘了改这里 → 备份**静默失败**（已经真实发生过，见 §5）。

---

## 4. 推送凭据（详见 `scripts/push-main.sh`）

| 层级 | 形式 | 存放位置 | 现状（2026-09-28） |
|---|---|---|---|
| ① SSH Deploy Key | `~/.ssh/hook_fishpond_deploy`（ed25519，无 passphrase） | GitHub 仓库级 Deploy Key，名 `hook-fishpond-ai-push`，`read_only: false` | ✅ **在用，已实测真写通过** |
| ② Windows 凭据管理器 | `git-credential-wincred`（DPAPI 加密） | 本机凭据管理器 | ⚪ **已清除** |
| ③ 本地凭据文件 | 明文 env 文件 | `.workbuddy/secrets/github.local.env` | ⚪ **已删除** |

**现在的状态：本机不留任何 GitHub 凭据，推送只靠仓库级 SSH 密钥。**
（那把 classic PAT 曾同时存在于 ② 和 ③，撤销它之后两级都会失效 —— 所以直接清掉了。）

- 推送：`bash scripts/push-main.sh`
- 清理：`bash scripts/remove-push-credential.sh`
- 想恢复兜底链：建一把 **fine-grained** token（只授权 `cdh428/hook-fishpond`，
  权限 `Contents: Read and write`；要改 Actions secret 再加 `Secrets: Read and write`），
  再 `bash scripts/setup-push-credential.sh`。**不要再建 classic token。**

> ⚠️ Deploy Key 的能力边界：**只能推这一个仓库**。管不了 Actions secrets、仓库设置、其他仓库。
> 改 Secret 走网页 UI 即可，不需要 token。

---

## 5. 待处理的安全事项

- 🔴🔴 **每日冷备从未成功过（2026-09-28 实测）** —— `db-backup.yml` 自 2026-09-17 建立以来
  **11 次运行全部 failure**，`success` 一次都没有。也就是说**「冷备」实际上不存在**，
  Supabase 里还是 2026-07-28 之前那份旧数据。
  修法见 §3（建 Secret）+ `db-backup.yml` 里那三处缺陷注释；修好后**必须手动
  `workflow_dispatch` 跑一次**确认变绿。
- 🔴 **Supabase 冷备库口令已泄漏，且仍然有效。**
  公开仓库自 2026-07-15 起在 `docs/SETUP_GUIDE.md` 与 `docs/archive/CONNECT_GUIDE.md`
  里含明文连接串；2026-09-28 用只读探针实测**仍可连接**（PG 17.6）。
  **唯一修法是重置数据库密码**，然后把新值写进 §3 的 `SUPABASE_DATABASE_URL`。
- 🔴 **一把全权限 GitHub classic PAT 按已泄漏处理，待撤销。**
  2026-09-28 实测仍有效、20 项 scope（含 `admin:public_key` ⇒ 能往账号加公钥 = 永久后门）。
  本机的两处副本已清除，**但 GitHub 那侧必须手动撤销**：github.com/settings/tokens
- ⚠️ **Neon 主库口令**同样在 git 历史里出现过（`docs/SETUP_GUIDE.md` 的 Neon 段）。
  建议一并轮换，并同步 Vercel 的 `DATABASE_URL` / `DIRECT_URL`。
- ⚠️ 顾客身份目前靠 `x-user-id` header 传递，**可伪造**。
  真正的修法是上 OTP（方案已定：LINE Login + 官方账号收码），见 `otp-line-login-oa-plan.html`。
- ⚠️ `ADMIN_SESSION_SECRET` 若由 `DATABASE_URL` 回退充当，则**重置数据库密码会连带踢掉管理员会话**。
  建议显式配置一个独立值。
