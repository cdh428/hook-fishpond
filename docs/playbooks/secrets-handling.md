# 凭据管理手册（Secrets Handling）

> 权威版本 · 更新日期 2026-10-09 · 适用 `C:\Users\dnlct\WorkBuddy\hook-fishpond`
>
> **一条铁律：秘密只存本机，绝不出现在任何进 git 的文件里（仓库是 public）。**
> 本文定义「读凭据」的唯一入口，让所有 AI / 脚本 / 本地验证都用同一套规则，不再各自硬编码。

---

## 0. 凭据存放总表

| 凭据 | 本机文件（唯一真相源） | 进 git？ | 读取方式 |
|---|---|---|---|
| **管理员后台口令** | `.workbuddy/secrets/ADMIN_PASS.txt` | ❌ 永不 | 见 §1 |
| 数据库连接串（Neon/Supabase） | `.env.local`（已 gitignore） | ❌ 永不 | `dotenv` 读 `.env.local` |
| LINE / Meta 社媒令牌 | `.env.local`（已 gitignore） | ❌ 永不 | `dotenv` 读 `.env.local` |
| GitHub 推送（SSH Deploy Key） | `~/.ssh/hook_fishpond_deploy` | ❌ 永不 | git 走 SSH 别名 `github-hookfishpond` |

> ⚠️ **`.workbuddy/` 整目录被 `.gitignore` 忽略**（第 44 行），所以 `ADMIN_PASS.txt` 天然不会进 git。
> 但「不进 git」≠「安全」：`.workbuddy/` 里**可能**被人手动放进明码 → **任何「往外搬内容」的动作，
> 单独扫一遍 `.workbuddy/`**（这是 2026-07 的真实教训：曾在 `memory/2026-07-14.md` 里翻出 `ghp_` 令牌）。

---

## 1. 管理员后台口令（本次新增，AI 必读）

**唯一文件**：`.workbuddy/secrets/ADMIN_PASS.txt`（格式 `user=...` / `password=...`）

### 读取（推荐：一次性 node 助手，不回显）

```bash
# 读 user / password（打印时打码，避免泄漏到日志）
node -e '
const fs=require("fs");
const s=fs.readFileSync(".workbuddy/secrets/ADMIN_PASS.txt","utf8");
const kv={};
s.split("\n").forEach(l=>{const m=l.match(/^(user|password)=/);if(m)kv[m[1]]=l.slice(5).trim();});
console.log("user="+kv.user+" / password="+("共"+kv.password.length+"字符 ✓"));
'
```

### 在脚本 / API 调用里用（不进命令行参数、不进 git）

```bash
# shell：source 后 $ADMIN_PASSWORD 可用（值只在本机内存）
set -a; source <(grep -E '^(user|password)=' .workbuddy/secrets/ADMIN_PASS.txt | sed 's/^user/ADMIN_USERNAME/;s/^password/ADMIN_PASSWORD/'); set +a
```

```js
// node / mjs：读成 env
import fs from "node:fs";
const kv = Object.fromEntries(
  fs.readFileSync(".workbuddy/secrets/ADMIN_PASS.txt","utf8")
    .split("\n").filter(l=>/^(user|password)=/.test(l))
    .map(l=>{const[k,v]=l.split("=");return [k==="user"?"ADMIN_USERNAME":"ADMIN_PASSWORD", v.trim()];});
);
process.env = { ...process.env, ...kv };
```

### 后台接口的鉴权（怎么拿到 cookie）

- 接口认 **`admin-session` cookie**（HMAC 签名，见 `src/lib/auth.ts`）。
- 本地验证：`POST /api/admin/auth/login`（body: `{username, password}`）拿到 cookie，
  后续请求带 `Cookie: admin-session=<值>`。
- 口令从 §1 的文件读，**不要**写死在脚本里。

### 轮换（永不打印新值）

```bash
node scripts/rotate-admin-password.mjs   # 改库 + 更新本文件，控制台不回显
```

---

## 2. 消敏规则（改完任何仓库文件后必查）

**目标**：github 仓库（含历史之外的当前树）与网站产物里**没有**任何明码。

### 扫描命令

```bash
# 仓库自带密文扫描器（扫暂存区 / 全量）
bash scripts/check-secrets.sh --all        # 全量已跟踪文件
bash scripts/check-secrets.sh              # 只扫暂存区新增行（pre-commit 自动跑）

# 手动精准搜真实连接串 / 令牌特征（占位符 <user> 不算）
rg -n "npg_[A-Za-z0-9]{8,}|Fishpond%402026|neondb_owner:[^@]" --glob '!node_modules' .
```

### 判定

| 命中的内容 | 是明码吗 | 处理 |
|---|---|---|
| `postgresql://<user>:<pass>@...` | ❌ 占位符，可留 | 不管 |
| 脚本里的 `github_pat_[A-Za-z0-9_]{50,}` 正则 | ❌ 是扫描用的模式 | 不管 |
| 某文件里的真实 `npg_xxxxxxxx` / `Fishpond@2026` | ✅ **明码** | 见下 |
| node_modules 第三方库文档里的示例 | ❌ 非本仓凭据 | 不管 |

### 发现明码的处置（顺序不能错）

1. **先轮换**（GitHub 网页改 Secrets / Neon 重置口令 / Supabase 重置），**不是先删文件**。
   > 删文件没用——值已进 git 历史（public 仓库 2.5 个月，见 `docs/CREDENTIALS.md` §9）。**删 ≠ 修复。**
2. 再把文件里的明码替换成占位符（`<user>` / `<pass>`）或指向 `.env.local` 的读法。
3. 跑 `bash scripts/check-secrets.sh --all` 确认当前树干净。
4. 若明码只在本机（`.workbuddy/`、`.env.local`）且从未进 git → 可直接清理，不用轮换。

---

## 3. 「把内容往外搬」的安全闸门

任何把项目文件 / 记忆 / 文档复制到**外部**（资料库、GitHub、聊天记录、分享）前：

- [ ] `bash scripts/check-secrets.sh --all` 绿
- [ ] **单独扫 `.workbuddy/`**（密文扫描器扫不到它，因为被 gitignore）：
      `rg -n "npg_|Fishpond@|ghp_|github_pat_|xox[baprs]-|sb_publishable_|omise_(live|test)_" .workbuddy/ --glob '!memory/**.tmp'`
- [ ] 确认搬出去的文件里**没有** `.env.local` / `ADMIN_PASS.txt` / `admin.local.env` 的**内容**

---

## 4. 相关文件

- `docs/CREDENTIALS.md` —— 凭据位置清单 + 待处理安全事项（§5）
- `docs/playbooks/deploy-and-backup.md` —— 数据库备份 Secrets（§3）
- `docs/playbooks/social-tokens-setup.md` —— LINE/Meta 令牌 30 秒速查
- `scripts/check-secrets.sh` —— 密文扫描（pre-commit 已挂）
- `scripts/rotate-admin-password.mjs` —— 管理员口令轮换
- `.gitignore` 第 44 行 `.workbuddy/`、第 45 行 `.env*` —— 凭据目录排除
