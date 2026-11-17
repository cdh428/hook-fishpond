# link.md — 连接 · 闸门 · 安全 统一知识库

> **本文件是「怎么连、怎么改、怎么防泄漏」的唯一入口。**
> 任何会话（人 / AI）在**推送代码、改 Vercel 变量、连数据库、连另一台电脑、处理凭据**之前，
> 先读这一页。下面每条都指向权威源，本文只做索引与硬规则，不重复细节。
>
> ⚠️ **本文件永不含任何密钥值。** 密钥只存在于本机 `.workbuddy/secrets/` 与 `.env.local`（均 gitignore）。
> 仓库是 **public** —— 写进任何进 git 文件的值 = 公开发布。
>
> 最后更新：2026-11-17 · 适用工作目录 `C:\Users\dnlct\WorkBuddy\hook-fishpond`

---

## 0. 三条铁律（违反即事故）

1. **值不进仓库。** 凭据只允许存在于四处：本机 `.env.local`、`.workbuddy/secrets/`、
   Vercel 环境变量、GitHub Actions Secrets。其余一律不许。
2. **删 ≠ 修复。** 明文一旦进过 git 历史（public 仓库），必须**先轮换**再清理文本。
3. **轮换后同步所有引用点**，否则静默失败（每日冷备曾因此 11 次全败无人发现）。

---

## 1. 密钥存放地图（值只在这几处）

| 凭据 | 唯一真相源（本机） | 进 git | 读取方式 |
|---|---|---|---|
| 管理员后台口令 | `.workbuddy/secrets/ADMIN_PASS.txt` | ❌ | `docs/playbooks/secrets-handling.md` §1 |
| 数据库连接串（Neon） | `.env.local` → `DATABASE_URL` / `DIRECT_URL` | ❌ | `dotenv` |
| LINE / Meta / Omise 令牌 | `.env.local` | ❌ | `dotenv` |
| LINE Login 两把钥匙 | `.workbuddy/secrets/line-login.env` + `.env.local` | ❌ | `dotenv` / 复制到 Vercel |
| GitHub 推送 | `~/.ssh/hook_fishpond_deploy`（ed25519） | ❌ | SSH 别名 `github-hookfishpond` |
| 打印机桥通信密钥 | `tools/print-bridge/*config.json` → `authToken` **+** 浏览器 localStorage | ❌（已 gitignore） | 后台「打印设置 → 通信访问密钥」 |
| **轮换状态 / 待办** | `.workbuddy/secrets/ROTATION.md` | ❌ | 直接看 |

> **通用标准**：跨项目的密钥存放规范、分级判据、方案取舍见用户级 skill
> `~/.workbuddy/skills/secret-hygiene/`（`SKILL.md` 是正文，`reference/comparison.md` 是对照）。

**已实测确认被 gitignore（2026-11-17）**：`.env.local` · `.env.vercel` · `.workbuddy/` 整目录
（含 `secrets/`、`memory/`、`backups/`）。`git ls-files | grep '^\.env'` 只应返回 `.env.example`。

> ⚠️ `.workbuddy/` 被 gitignore ⇒ **仓库自带的密文扫描器永远扫不到它**。
> 任何「把内容往外搬」的动作，**必须单独再扫一遍 `.workbuddy/`**（`secrets-handling.md` §3）。

---

## 2. 四条连接通道

### 2.1 推送代码 → GitHub（唯一日常通道）
权威源：`docs/playbooks/deploy-and-backup.md` §1

```bash
git status --porcelain                    # 先看有无并行会话的改动
git add <明确路径>                         # 禁用 add -A / commit -a
git diff --cached --stat                  # 逐个确认真是自己的
git commit -m "..."                       # pre-commit 会自动跑密文闸门
bash scripts/push-main.sh                 # 三级凭据链，第一级成功即停
```

- remote 是 SSH 别名 `git@github-hookfishpond:cdh428/hook-fishpond.git`
  （**别名里不含 `github.com`**，别用 `*github.com*` 去匹配判断）
- 三级链：① SSH Deploy Key（`read_only:false`，已实测真写）→ ② 凭据管理器（已清）→ ③ 本地 env（已删）
- **本机不留任何 GitHub 口令**；public 仓库 `git ls-remote` 匿名可读 ≠ 有凭据（易误判）
- `--dry-run` 证明不了写权限（已同步只回 `Everything up-to-date`）。真验：推临时 ref
  `HEAD:refs/heads/__probe__` → `ls-remote` → `push --delete`

### 2.2 部署 → Vercel（不用手动，push 自动触发）
权威源：`docs/playbooks/deploy-and-backup.md` §2

- push `main` → Vercel 自动构建项目 **`hook-fishpond-xi15`** → 3~5 分钟
- ⚠️ **只盯 xi15 这一个项目**。同仓库还挂着 3 个永远失败的僵尸项目
  （`hook-fishpond` / `hook-fishpond-1eyy` / `hook-fishpond1`），
  账号总体 state 会被它们拖成 `failure`，**不要据此下结论**
- 判断「新构建上了没」——看内容哈希，**先记后比**（只看 200 判不出新旧）：
  ```bash
  curl -s https://www.hookfishpond.com/zh | grep -oE '/_next/static/chunks/app/layout-[a-f0-9]+\.js' | head -1
  ```

### 2.3 数据库 → Neon PostgreSQL（运行时唯一数据源）
权威源：`docs/CREDENTIALS.md` §2 · `.env.example`

- 走 `src/lib/prisma.ts` 的 PrismaPg adapter：SSL 必须带、`max:1`、生产复用 `globalThis.prisma`
- 连接串取 `DATABASE_URL || DIRECT_URL`
- 健康检查：`GET /api/health/db` → `{"ok":true,"pondCount":N}`（**只回布尔/端口/域名后缀，绝不回连接串**）
- **Supabase 冷备已失效**（项目 `ehsmsjmmccliysxnkgpv` 不存在）⇒ 备份只能本地导出：
  `node scripts/backup/export-neon-sql.cjs` → `backups/neon-<date>.sql`（已 gitignore）
- ❗方向恒为 **Neon → 文件**，**绝不反向**（`check-and-migrate.js` 曾把过期冷备灌回生产，已停用）

### 2.4 连接另一台电脑 → 打印桥（Tailscale 跨网）⭐
权威源：`tools/print-bridge/目标电脑使用说明.md`

这是本项目唯一的「跨机器连接」通道：网页 → 打印桥（跑在收银机上）。

| 项 | 值 / 做法 |
|---|---|
| 目标机 | `desktop-h9c31c4`，Tailscale IP `100.85.92.120`，端口 `17777` |
| 监听 | `0.0.0.0`（同时支持本机 / 局域网 / Tailscale 跨网） |
| 健康检查 | `http://127.0.0.1:17777/health` 或 `http://100.85.92.120:17777/health` |
| 部署 | 拷 `tools/print-bridge` 整目录到目标机 → **管理员身份**跑 `启动打印服务.bat`（自动加防火墙规则 + 打自检纸） |
| 开机自启 | `HookFishpond-PrintBridge.vbs`（无黑框）；**开机自启只能放 Startup 文件夹**，本机 schtasks/wscript 被沙箱拦 |
| 鉴权 | `config.json` 的 `authToken` ↔ 后台「打印设置 → 通信访问密钥」**必须完全一致**；带上 `X-Print-Key` 头，缺失/不符 → **401** |
| 公共 Wi-Fi 时 | 加 `--host 127.0.0.1` 只开本机，别裸奔 |
| 配置不入库 | `config.json` 与 `_deploy_config.json` 均含真实 `authToken`，已被 `.gitignore` 的 `tools/print-bridge/*config.json` 挡住 |

**硬规则**
- `authToken` 为空 = 不校验 = 任何能访问 17777 的人都能让打印机出纸。**跨网部署必须配。**
- 密钥**两处必须同步改**，只改一边会静默 401（症状：后台显示「未启动」/「未授权」）。
- CSP **故意不含** `connect-src` —— 加了会断打印桥的 `127.0.0.1` 调用。
- 打印机端口**不要暴露到公网**；跨网只走 Tailscale 私有网络。
- `config.json` / `_deploy_config.json` 里的 `authToken` **已 gitignore**
  （`.gitignore` 规则 `tools/print-bridge/*config.json`），但仍要确认没被 `git add -f` 强制加进来。

---

## 3. 闸门（自动拦截，不许绕过）

> **通用标准见用户级 skill `secret-hygiene`**（`~/.workbuddy/skills/secret-hygiene/`）。
> 本节是本项目的**具体落地**；跨项目复用、分级判据、方案取舍都在那个 skill 里。

| 闸门 | 触发点 | 规则 |
|---|---|---|
| **密文闸门 ①** | pre-commit → `gitleaks protect --staged` | 社区 150+ 规则 + 熵检测，秒级离线。配置在 `gitleaks.toml` |
| **密文闸门 ②** | pre-commit → `scripts/check-secrets.sh` | 项目特有形态（自研 token、中文口令）；gitleaks 缺失时它单独扛 |
| **快速体检** | `node scripts/scan-secrets-fast.mjs [--workbuddy]` | 全量/含 `.workbuddy` 的只读扫描（gitleaks 不扫被 ignore 的目录） |
| **三语闸门** | `npm run check:i18n` / `check:i18n:live` | 改任何页面/文案后必跑，`--live` 打生产域名 |
| **类型闸门** | `npx tsc --noEmit` | 0 错才推 |
| **构建闸门** | `CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build` | 不带前缀会「编译全过但退出码 1」（safe-delete 上限） |
| **暂存核对** | 手工 | `git status --porcelain` + `git diff --cached --stat`，只 `add` 具体路径 |
| **安全响应头** | `next.config.mjs` | CSP 故意不含 `script-src`/`style-src`（内联水合会白屏）、不含 `connect-src`（断打印桥） |
| **API 错误体** | 各 `route.ts` | 不回 `error.message`（Prisma message 常含 host/库名/参数） |

**四层为什么缺一不可**

| 层 | 抓什么 | 抓不到什么 |
|---|---|---|
| gitleaks | 已知服务商格式 + 熵检测 | 项目自定口令、无前缀随机串 |
| check-secrets.sh | 项目特有形态 | 没写进规则的新形态 |
| scan-secrets-fast | `.workbuddy/` 雷区（被 gitignore，gitleaks 默认不扫） | 实时性（靠手动跑） |
| CI 扫描（L3 待装） | 绕过本机钩子的提交 | 已 push 很久的历史 |

**扫描命令**（只读，安全）
```bash
~/.workbuddy/bin/gitleaks.exe dir . --config gitleaks.toml --redact   # 当前树
~/.workbuddy/bin/gitleaks.exe git . --config gitleaks.toml --redact   # 全历史（166 commits，约 0.5 秒）
node scripts/scan-secrets-fast.mjs --workbuddy                        # 含 .workbuddy 雷区
```

> ⚠️ **gitleaks 的 `dir` 模式不读 `.gitignore`** —— 被忽略的目录（`.next/`、`*.config.json`）
> 仍会被扫到。所以 `gitleaks.toml` 里必须用 `[[allowlists]]` 的 `paths` 显式排除，否则体检恒红。

> ⚠️ **不要用 `bash scripts/check-secrets.sh --all` 做全量体检**：它把每个文件 `cat` 进
> shell 变量再 grep，本机在 1.7 万文件（含封存子项目）的仓库里会**卡住/超时**（2026-11-17 实测）。
> 体检用 `scan-secrets-fast.mjs`；pre-commit 仍走 `check-secrets.sh`（只扫暂存区，很快）。

**判定表**（照 `secrets-handling.md` §2）
| 命中内容 | 是明码？ | 处理 |
|---|---|---|
| `postgresql://<user>:<pass>@...` | ❌ 占位符 | 不管 |
| 脚本里的 `github_pat_[A-Za-z0-9_]{50,}` | ❌ 是扫描正则 | 不管 |
| `sb_publishable_*` / `NEXT_PUBLIC_*` / `pk_live_*` | ⚠️ **公开级**，不用轮换 | 但不该硬编码进代码 |
| 真实 `npg_xxxx` / `ghp_xxx` / 带口令连接串 | ✅ | 先轮换 → 再替换 → 再扫 → 才算完 |

---

## 4. 明文泄露处置流程（顺序不能错）

1. **先轮换**（GitHub 网页 / Neon 重置口令 / Supabase 重置 / Omise 后台），**不是先删文件**
2. 再把文本里的明码换成占位符或 `.env.local` 读法
3. `bash scripts/check-secrets.sh --all` 确认当前树干净
4. 若明码**只在本机**（`.workbuddy/`、`.env.local`）且从未进 git → 可直接清理，不用轮换

> 2026-11-17 全库扫描结论：**当前已跟踪文件无明文凭据**（命中项全是占位符 / 图片 base64 / 注释里的域名后缀）。
> 历史明文已于 commit `490535fc` 清空。但**历史仍在**（public 仓库）⇒
> Neon 主库口令、Supabase 口令、那把全权限 classic PAT **仍建议轮换/撤销**（见 `CREDENTIALS.md` §5）。

---

## 5. 改 Vercel 环境变量（本机无凭据，只能网页做）

**本机没有 Vercel 凭据**（`~/.vercel` 不存在）⇒ `vercel env add` 那套 CLI 写法**跑不了**。

> Vercel → 项目 **`hook-fishpond-xi15`** → Settings → **Environment Variables** → 增/改 → **必须 Redeploy**

- ⚠️ `NEXT_PUBLIC_*` 是**构建期内联**：光改 env 不 Redeploy = 没改（`NEXT_PUBLIC_BASE_URL` 踩过，
  最终靠 `src/lib/site.ts` 代码兜底）
- ⚠️ `ADMIN_SESSION_SECRET` 若靠 `DATABASE_URL` 回退充当 ⇒ 重置数据库口令会连带踢掉所有管理员会话
- 各变量用途与轮换方式：`docs/CREDENTIALS.md` §2

**当前待配**（OTP 线唯一卡点）：
| 变量 | 值来源 |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | `2012658842`（非机密） |
| `LINE_LOGIN_CHANNEL_SECRET` | `.workbuddy/secrets/line-login.env`（复制，不入 git） |

`docs/archive/CONNECT_GUIDE.md` 是**归档旧指南**，里面的 `git remote set-url https://<PAT>@...`
已被否决（token 落盘），**别照抄**。

---

## 6. 会话/身份凭据（应用层）

| 项 | 机制 | 权威源 |
|---|---|---|
| 管理员会话 | HMAC 签名 cookie，payload 带 `k=admin` | `src/lib/auth.ts` · `secrets-handling.md` §1 |
| 顾客会话 | 同套 HMAC，`k=cust`（与 admin 隔离，不能互冒） | **`docs/playbooks/customer-auth.md`**（改前必读） |
| 密钥来源 | `ADMIN_SESSION_SECRET`，缺失则退回 `DATABASE_URL` | 建议显式配置独立值 |
| 限流 | admin IP 15min/20 + 账号 15min/10；顾客 IP 10min/20 | `src/lib/*` |
| 顾客身份 | LINE Login 主通道 + `x-user-id` **兼容期回退**（可伪造，待退场） | `customer-auth.md` |

---

## 7. 文档索引（真权威源，别在本文件里找细节）

| 主题 | 文件 |
|---|---|
| **凭据位置 / 轮换 / 待处理安全问题** | `docs/CREDENTIALS.md` |
| **密钥读法 / 消敏 / 外搬闸门** | `docs/playbooks/secrets-handling.md` |
| **推送 / 部署 / 备份 Runbook** | `docs/playbooks/deploy-and-backup.md` |
| **推送前必查清单** | `docs/playbooks/push-checklist.md` |
| **顾客认证实现契约** | `docs/playbooks/customer-auth.md` |
| **安全审计与修复** | `docs/playbooks/security-audit.md` |
| **打印桥跨机部署** | `tools/print-bridge/目标电脑使用说明.md` · `tools/print-bridge/README.md` |
| **社媒令牌获取** | `docs/playbooks/social-tokens-setup.md` · `meta-system-user-setup.md` |
| **代码契约（事务/库存/金额）** | `docs/CODE-CONTRACTS.md` |
| **语言一致性（输出跟页面语言）** | `docs/playbooks/language-consistency.md` |
| **踩坑总集** | `docs/playbooks/gotchas.md` |
| **业务/运营** | `docs/OPERATIONS.md` · `PROJECT.md` |
| **环境变量模板** | `.env.example` |

---

## 8. 本机环境坑（会让「连接」莫名失败）

| 症状 | 真因 | 做法 |
|---|---|---|
| `curl http://127.0.0.1:x` 返回假 502 | 本机有 `http_proxy` | 一律 `curl --noproxy '*'` |
| `node x.mjs` 报 `MODULE_NOT_FOUND` | Git Bash 改写参数路径 | 脚本路径写 `C:/...` 或 `$TEMP/...` |
| `/tmp/x` 打不开 | node 认成 `C:\tmp` | 用 `$TEMP` |
| `npx next build` 编译过但退出 1 | safe-delete 单轮上限 | 前缀 `CODEBUDDY_SAFE_DELETE_ENABLED=0` |
| 删 `app/api/**` 路由后 build 报 TS2307 | `.next/dev/types` 残留 | 先 `npx rimraf .next` |
| `next dev` 页面全 500 | Turbopack 软链死循环 | 改验 `next build && next start`，别删别人的目录 |
| Playwright 对 Vercel 报 `ERR_SSL_PROTOCOL_ERROR` | 代理 + QUIC | `--no-proxy-server --disable-quic` |
| Bash 里中文/泰文乱码 | GBK 输出 | 核对用 Grep 工具或 node `includes()` |

---

## 9. 每会话自检（30 秒）

```bash
cd /c/Users/dnlct/WorkBuddy/hook-fishpond
git status --porcelain | grep -v '^??'     # 有无并行会话改动
git log --oneline -3                        # 自己在哪个基点上
node scripts/scan-secrets-fast.mjs          # 当前树有无明文（应绿）
```
