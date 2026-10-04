# 部署 & 备份 Runbook（给 AI Agent）

> **本文件是「推送 Git + Vercel 部署 + 数据库备份」三条链路的操作手册，专为
> 让另一个 AI agent 直接读取并执行而写。** 目标是「照抄命令即可完成，不需要
> 再翻其它文件」——但**遇到本文没覆盖的情况，先读对应的权威源，别猜**：
>
> | 主题 | 权威源 |
> |---|---|
> | 推送前的三语核验 / i18n / 密文闸门 | `docs/playbooks/push-checklist.md` |
> | 凭据位置、轮换、待处理安全事项 | `docs/CREDENTIALS.md` |
> | 代码契约（事务/库存/金额/菜单大类…） | `docs/CODE-CONTRACTS.md` |
> | 数据库结构、冷备设计原理 | `docs/ARCHITECTURE_V2.md` |
>
> 更新：2026-10-04 · 适用提交 `5392256`

---

## 0. 30 秒现状速览（先读这个，再动手）

```
Git   cdh428/hook-fishpond (public)  ←  权威源，推送走 SSH Deploy Key（零口令）
      本机历史上有两份同源的仓库副本：
        · D:\Github\hook-fishpond                    ← 旧副本（**只读**，不再改动/提交）
        · C:\Users\dnlct\WorkBuddy\hook-fishpond     ← **唯一工作目录**（2026-09-28 用户拍板）
      ⚠️ **以后一律在 C 盘改、在 C 盘提交**；D 盘退役为只读旧副本，删不删由用户定。

Web   Vercel 项目 `hook-fishpond-xi15`  →  生产域名 https://hookfishpond.com
      （hook-fishpond-xi15.vercel.app 是同一部署，不是回滚点）
      同仓库还挂了 3 个僵尸 Vercel 项目（hook-fishpond / hook-fishpond-1eyy /
      hook-fishpond1），它们**永远失败**，轮询部署时**只看 xi15 那一个**。

DB    Neon  = 主库（运行时唯一数据源，PG 18.6，us-east-2，Vercel env DATABASE_URL）
      Supabase = 冷备（每日 pg_dump 写入，PG 17.6，免费档靠每日写入才不暂停）
      备份走 GitHub Actions（db-backup.yml，每天 00:00 曼谷时间）
```

---

## 1. 推送 Git

### 1.1 事实（别重新发明）

- `origin` 的 remote URL 是 **SSH 别名**：`git@github-hookfishpond:cdh428/hook-fishpond.git`
  （注意：别名里**不含 `github.com`** 字样，判断远程时别拿 `*github.com*` 去匹配）。
- 推送用 `bash scripts/push-main.sh`，它按 ①②③ 三级依次试、**第一级成功就停**：
  ① SSH Deploy Key（仓库级、`read_only:false`、**已实测有真实写权限**）→
  ② Windows 凭据管理器 → ③ 本地明文文件（`.workbuddy/secrets/github.local.env`，已 gitignore）。
- **本机已不留任何可复制的 GitHub 口令**，日常推送**只靠 ① 就够**。
- pre-commit 有**密文闸门**（`check-secrets.sh`）：提交时自动扫暂存区新增行里的
  明文凭据，扫到就拦。**不要 `--no-verify` 跳过**；确实要提交示例值时用
  `ALLOW_SECRETS=1 git commit …`。

### 1.2 可复制命令（在 `C:/Users/dnlct/WorkBuddy/hook-fishpond` 里跑）

```bash
# ① 提交前：只暂存自己改过的具体路径（绝不用 git add -A）
git status --porcelain                 # 先看有没有别人/别的会话的改动混进来
git add <明确路径1> <明确路径2> …
git diff --cached --stat               # 逐个确认暂存的都是自己改的
git commit -m "message"                # 让 pre-commit 跑密文闸门

# ② 推送（先验凭据、再真推）
bash scripts/push-main.sh --dry-run --verbose    # 不写远端，只验 ①②③ 哪级通
bash scripts/push-main.sh                        # 真推：通常 ① 就成功

# ③ 确认本地 == 远端
git rev-parse HEAD
git ls-remote origin main | cut -f1              # 两个 SHA 必须相同
```

### 1.3 判定标准 / 踩坑

- **`--dry-run` 证明不了「写权限」**：已同步时它只回 `Everything up-to-date`。
  要真验写权限 = 推一个临时 ref：
  `git push origin HEAD:refs/heads/__probe__` → `git ls-remote` 确认存在 →
  `git push --delete origin __probe__` 清掉。
- **别用 `remote set-url` 塞带 token 的 URL**（token 会落盘）。要临时用 HTTPS + token，
  走 `push-main.sh` 的 ②③ 级或一次性 URL 参数。
- **要调 GitHub API（改 Actions secret、看日志等）时**，**不要**再建全权限 classic
  token；需要就建 **fine-grained**（只选 `cdh428/hook-fishpond`，
  `Contents: Read and write`；要改 secret 再加 `Secrets: Read and write`），
  然后 `bash scripts/setup-push-credential.sh`（口令走 stdin，不进命令行/历史）。
- 清理脚本：`bash scripts/remove-push-credential.sh`（`--yes` 免确认）。

---

## 2. 部署到 Vercel

### 2.1 事实

- **不需要手动部署**：push 到 `main` 后，Vercel 自动构建并上线
  `hook-fishpond-xi15`。等 3~5 分钟。
- 上线判定**不要**只看「HTTP 200」或「页面看起来还是旧的」——那两种表现一样。
- 两个 Vercel Cron（`vercel.json`）：`/api/cron/daily-report`（14:00 UTC）、
  `/api/cron/stock-sweep?apply=1`（17:00 UTC）。

### 2.2 判定「新构建到底上了没」：看 layout chunk 哈希 🎯

```bash
# 推送前先记下当前的 layout chunk 哈希（「先记后比」）
curl -s https://hookfishpond.com/zh | grep -oE '/_next/static/chunks/app/layout-[a-f0-9]+\.js' | head -1

# 部署完成后再抓一次，哈希变了 = 新构建真的上线了（比刷新/死等可靠）
```

同样的思路适用于任何内容哈希产物：`/_next/static/chunks/app/<route>-<hash>.js`、
带哈希的 CSS / 图片。**只比 200 状态码是判不出新旧的。**

### 2.3 轮询与判定

- 若有 Vercel 令牌，**只盯 `hook-fishpond-xi15` 这一个项目**的 status；
  整体账号的 `state` 会被 3 个僵尸项目拖成 `failure`，别据此下结论。
- 线上复验：`curl -s -o /dev/null -w "%{http_code}\n" https://hookfishpond.com/zh` → 期望 200；
  动到文案再跑 `node scripts/check-i18n.mjs --live`（详见 push-checklist）。

---

## 3. 数据库备份（Neon → Supabase 冷备）

### 3.1 事实

- **架构**：Neon 是主库；Supabase 是**冷备**（免费档 7 天不写就暂停，
  每日 `pg_dump` 写入一次，既留了灾备副本、又顺手保活）。
- **备份在 GitHub Actions 里跑**（`.github/workflows/db-backup.yml`，每天 17:00 UTC =
  00:00 曼谷），**不在本机跑**。调用 `scripts/backup-neon-to-supabase.js`：
  `pg_dump Neon（结构+数据）→ psql 灌进 Supabase（覆盖式，幂等）`。
- **为什么用 Actions Secrets 而不是本地跑**：值只在 GitHub 侧加密存，运行时才解密进
  runner 环境变量，日志自动打码，仓库里 / workflow 里都看不到明文 ——
  这是「每天自动跑又不泄露口令」的标准答案。
- **脚本的两个关键设计**（改脚本时别改回去）：
  - `ensureValidSslMode()`：保证连接串带**合法的** `sslmode`（libpq 只认 6 个值；
    曾经错用 `no-verify` 导致 `pg_dump` 直接退出）。Neon/Supabase 都强制 TLS，
    用 `require`（加密但不校验证书）正是本意。
  - 两步都设 `maxBuffer: 256 MiB`（`pg_dump` 默认只有 1 MiB，数据一涨就 `ENOBUFS`）。

### 3.2 需要哪些 Secrets（在 GitHub 网页上配，agent 做不了）

仓库 → **Settings → Secrets and variables → Actions** → 建两个：

| Secret | 值 | 来源 |
|---|---|---|
| `NEON_DATABASE_URL` | 主库连接串（带口令） | Neon Dashboard → Direct Connection（psql） |
| `SUPABASE_DATABASE_URL` | 冷备库连接串（带口令） | Supabase → Settings → Database |

> ⚠️ 2026-09-28 实测这两个 Secret **一个都不存在**（`total_count: 0`），
> 是冷备 11 连败的根因。**不建它们，备份永远跑不通。**

### 3.3 本机手动跑一次（可选，CI 之外的应急）

```bash
# 连接串只放环境变量，别写进任何仓库文件（仓库是 public）
export NEON_DATABASE_URL="postgresql://<user>:<pass>@<neon-host>.aws.neon.tech/neondb?sslmode=require"
export SUPABASE_DATABASE_URL="postgresql://postgres:<pass>@db.<project-ref>.supabase.co:5432/postgres"
node scripts/backup-neon-to-supabase.js
# 成功输出：✓ Dumped Neon (…) → ✓ Restored into Supabase standby → 🎉 Daily backup complete
```

> ⚠️ 本机（Windows/WorkBuddy）里 node 起子进程（`pg_dump`/`psql`）常被沙箱拦成 `EBUSY`。
> 本机跑不动就**靠 CI 跑**，或手动装好 PG 客户端后在能起子进程的环境跑。

### 3.4 触发与验证

```bash
# 手动触发（在 GitHub 网页：Actions → Database Backup → Run workflow；
# 或若有带 workflow 权限的 token：POST /repos/cdh428/hook-fishpond/actions/workflows/db-backup.yml/dispatches）
# 看结果（运行历史匿名可读）：
curl -s "https://api.github.com/repos/cdh428/hook-fishpond/actions/workflows/db-backup.yml/runs?per_page=5"
#   关注 "conclusion"：success = 绿；缺失 Secret 时 workflow 第一步会显式
#   报 "仓库 Secrets 缺失: …"（::error::），不用去翻日志猜。
```

- **修好 Secret 后务必手动 `workflow_dispatch` 跑一次确认变绿**，否则你不知道它
  到底通没通（历史上就是 11 次全败没人发现）。
- 断言 `pg_dump` 主版本 ≥ 18 的步骤已内置（Neon 是 PG 18.6，16.x 的
  `pg_dump` 会因 server version mismatch 直接 abort）。

### 3.5 恢复 / 迁移（**仅在灾备时手动做，绝不移回定时任务**）

`scripts/check-and-migrate.js` 是「Supabase 冷备 → Neon」的一次性迁移脚本，
**早已在 2026-07-28 用完并从 `db-backup.yml` 删除**。它若误判「Neon 是空的」，
会用**过期的冷备**以 `--clean --if-exists` **覆盖生产库**。需要时用知情人守着手动跑，
**不要**再放回每日定时任务。

---

## 4. 一页速查（贴到 agent 的 system prompt 里也行）

| 我要做什么 | 一条命令 / 动作 |
|---|---|
| 推送改动 | `bash scripts/push-main.sh`（先 `git status --porcelain` + 只 `add` 具体路径） |
| 验证推送写权限 | 临时 ref：`push HEAD:refs/heads/__p__` → `ls-remote` → `push --delete` |
| 确认部署上线 | 比 `layout-*.js` 哈希（先记后比）+ `/zh` 返回 200 |
| 轮询部署状态 | 只看 Vercel 项目 `hook-fishpond-xi15`（别被僵尸项目误导） |
| 手动跑备份 | `export NEON_DATABASE_URL… SUPABASE_DATABASE_URL…; node scripts/backup-neon-to-supabase.js` |
| 让备份在 CI 跑通 | GitHub 网页建两个 Actions Secret，再 `workflow_dispatch` 手动跑一次 |
| 查备份结果 | `GET /actions/workflows/db-backup.yml/runs`（看 `conclusion`） |

---

## 5. 给 agent 的三条硬约束（容易翻车的地方）

1. **凭据绝不进仓库、绝不进日志。** 值只来自：本机 `.env.local`（已 gitignore）、
   Vercel env、GitHub Actions Secrets、环境变量。任何要打印连接串的地方，
   照抄脚本里的 `url.replace(/\/\/[^@]+@/, "//***@")` 打码。
2. **同一时间只认一份仓库副本。** 改代码/提交只发生在**当前会话的工作目录**里
   （本 Runbook 基准 = `C:/Users/dnlct/WorkBuddy/hook-fishpond`，唯一工作目录；
   `D:\Github\hook-fishpond` 为只读旧副本，别在那儿提交）
   那份去提交，除非用户明确要求切换基准。
3. **备份/迁移类操作默认走「只读检查 + 手动确认」，不做无人值守的重写。**
   尤其 `check-and-migrate.js` 那类「把数据灌回生产」的脚本，**必须人工守着**。
