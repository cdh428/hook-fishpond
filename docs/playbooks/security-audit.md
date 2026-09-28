> **这是权威版本。** 项目里的同名 skill 只保留触发入口，正文以本文件为准。
> 搬进仓库的原因：`.workbuddy/` 被 `.gitignore` 忽略，知识只存在本机 —— 换机器或交接就没了。
> 已脱敏：去掉了所有明文凭据与「从仓库文件里读 token」这类过时做法。
> 更新日期：2026-09-28

# 钓场站安全与卫生体检

## 什么时候用

- 用户说「检查网站有什么漏洞 / 安全审计 / 体检 / 完善一下」
- 大版本上线前
- 接手改动前的基线摸底

配套：修复后的推送流程走 `fishpond-push-checklist`（本文只到「改完 + 本地验证」为止）。
改数据库内容 / 改菜单走 `fishpond-push-checklist` 里的专章。

## ⛔ 铁律：分清「能修的洞」和「要用户决策的洞」

这个站的结构性弱点很清楚：**顾客身份 = 手机号，且没有任何验证**。
它的唯一真修法是给顾客上 OTP（短信验证码），那是一个**需要用户先选短信通道**的新功能。

**绝对不要**为了显得「修好了」而做半吊子改动：

| 想做的动作 | 为什么不能做 |
|---|---|
| 让 `/api/auth/register` 命中已存在手机号时返回 409 | 前端只有「登录 / 注册」一个按钮，靠这条**幂等路径同时承担登录职责**。改成 409 = 谁都登不进来，站点直接坏掉 |
| 给顾客会话加签名 cookie | 签名只防篡改，不解决「谁能拿到会话」。第一步还是「报手机号就发会话」，等于没修 |
| 要求顾客接口登录 | 没有可用的第二因素，只会把正常下单流程堵死 |

**正确的做法**：能修的修干净（见下面清单），然后**明确写出「这一条需要你决定」**，
给出选项和代价。用户是「先看方案 → 讨论 → 再开发」的节奏，别抢跑。

## 检查清单（按「实际能查出东西」的顺序）

### 1. 数据隔离 —— 最容易漏、危害最大

**问法**：能不能只凭 URL 参数 / 请求头，就读到别人的数据？

```bash
# 列出所有查询串取参点
grep -rn "searchParams.get" src/app/api | sort
# 看哪些接口把查询参数直接当过滤条件
grep -rn "where: { userId\|where: { customerPhone\|userId ?" src/app/api
```

**2026-09-26 实际查到的**：
- `GET /api/bookings?phone=<任意>` / `GET /api/orders?phone=<任意>` —— **零鉴权**，
  手机号可枚举 → 姓名 / 预约 / 订单全泄漏
- 顾客身份只认 `x-user-id` 请求头，且**没有和查询串做一致性校验** → 直接改 URL 就能看别人

**修法模板**（见 `src/app/api/bookings/route.ts` 的 GET）：
```ts
const admin = await requireAdmin(request);
if (admin) { /* 管理端可按任意 userId 查 */ }
const me = await getUserFromRequest(request);
if (!me) return 401;
if (requestedUserId && requestedUserId !== me.id) return 403;
// 只用自己的 id 查
```
再加一条硬规则：**`?phone=` 这类「用可枚举标识换数据」的参数一律删掉**，
除非有明确且已鉴权的消费方。删之前先 `grep` 前端有没有在用 —— 这次两条都是**死参数**。

### 2. 鉴权覆盖矩阵

```bash
# 全部路由
find src/app/api -name route.ts | sort
# 有守卫的
grep -rl "requireAdmin\|requireSuperAdmin" src/app/api | sort
# 差值就是「公开接口」——逐个问：它该公开吗？
```

**只数守卫不够，还要看方法级**：一个 route 里 GET 公开、PUT 必须鉴权是常见形态。
典型坑：`/api/payments/[id]` 的 PUT 有三个 action，`admin_*` 有守卫，
`user_confirm` 没有 —— 要逐个 action 核。

### 3. 会话强度

```bash
# 会话 cookie 怎么写的
grep -rn "cookies.set\|cookies.delete" src/app/api src/lib
```

**判定标准**（四条缺一不可）：`httpOnly` ✅ / `sameSite` ✅ / `secure` ⚠️ 常有漏 /
**值是签名过的、不是裸主键** ⚠️ 常有漏。

**裸主键 cookie 为什么必须改**：`admin-session=<AdminUser.id>` 意味着这个 id 只要
泄漏过一次（接口回显 / 日志 / 截图），别人写进 cookie 就是**永久管理员**，而且不可撤销。
改法见 `src/lib/auth.ts` 的 `signAdminSession` / `verifyAdminSession`
（HMAC + 自带 `iat` + `timingSafeEqual`），密钥取 `ADMIN_SESSION_SECRET`，
**没配时回退 `DATABASE_URL`**（能跑，别因为少配一个 env 就把后台锁死）。
换密钥 = 一次性踢掉所有会话，这是应急手段，写进注释。

### 4. 凭据是否在公开仓库

```bash
curl -s https://api.github.com/repos/<owner>/<repo> | grep -o '"private": *[a-z]*'
grep -rniE "password\s*[:=]\s*['\"][^'\"]{3,}['\"]" src/ prisma/ --include=*.ts
```

**2026-09-26 实际查到的**：仓库是 **public**，而 `prisma/seed.ts` 里明文写着生产管理员口令
→ 等于公开凭据。

**⚠️ 2026-09-28 补充（这一条比 seed 更严重，务必照着查一遍）**：
`grep` 只扫源码是**不够的** —— 文档里的连接串同样是活凭据。当时查到的：

```bash
# 1) 全仓库找「带密码的连接串」，别只扫 src/
grep -rniE "(postgres|postgresql|mysql)://[^:@/[:space:]]+:[^@/[:space:]]{6,}@" . --exclude-dir=node_modules
# 2) 找到之后不要只看文件 —— 用只读探针验证它「现在还能不能连」：
#    能连上 = 活凭据泄漏，必须轮换；连不上 = 死凭据，删掉即可
```

实测结论：`docs/SETUP_GUIDE.md` 与 `docs/archive/CONNECT_GUIDE.md` 里的 Supabase
连接串**仍然有效**，而仓库是 public、已暴露约 2.5 个月。

**处置原则（重要）**：
1. **删文件 ≠ 修复** —— 值还在 git 历史里。唯一修法是**轮换**该凭据。
2. 轮换后必须同步所有引用点（Vercel env / GitHub Secrets / 本机 `.env.local`），
   否则备份任务会**静默失败**。
3. 顺手把 `.env.example` 的占位符确认成 `<PASSWORD>` 这种形态 ——
   否则密文扫描器会把它当真实连接串误拦。

现在有一道自动闸门：`scripts/check-secrets.sh`（pre-commit 用）
与 `.github/workflows/ci.yml`（CI 用 `--range` 扫提交范围）。
凭据台账见 `docs/CREDENTIALS.md`。

**修法**：seed 改读 `SEED_ADMIN_PASSWORD`，生产环境没设就**抛错退出**（不是给默认值）。
⚠️ **但改 seed 不能消除风险** —— 口令已经在 git 历史里了，**只有轮换口令才算修**。
轮换涉及「店员是否知道新口令」的运营影响 → **必须让用户决定**，不要自己改库。

### 5. 错误信息泄漏

```bash
grep -rn "error: error.message" src/app/api | wc -l
```

**判定**：Prisma 的报错带表名 / 列名 / 约束名，回给客户端就是信息泄漏。
**一键收敛**（保留 `console.error`，只换客户端看到的文案）：
```js
const re = /error:\s*error\.message\s*\|\|\s*("[^"]*")/g;
// 替换为 'error: $1'
```
⚠️ 别用 bash 内联写这个正则 —— Git Bash 会把 `\s` `\|` 剥掉导致语法错误，**写成 .cjs 文件跑**。

### 6. 安全响应头

```bash
curl -sI https://<域名>/zh | grep -iE "x-frame|x-content|referrer|permissions|content-security|x-powered"
```

**2026-09-26 之前：一个都没有**。加在 `next.config.mjs` 的 `headers()` 里。

⚠️ **两个不能加的**（加了站点就坏，理由写进注释免得后人顺手补）：
- `script-src` / `style-src` —— Next.js 水合脚本是内联的，没 nonce 的严格 CSP 直接白屏
- `connect-src` —— 收银台要从前端 fetch `http://127.0.0.1:<port>` 的本地打印桥，
  见 `windows-thermal-printer-bridge`。加了打印就断

加这些是安全的：`frame-ancestors 'none'`、`base-uri 'self'`、`form-action 'self'`、
`object-src 'none'`、`nosniff`、`Referrer-Policy`、`Permissions-Policy`，
外加 `poweredByHeader: false`。

### 7. 死代码里藏着的危险接口

```bash
# 找出没人调用的接口
grep -rn "api/admin/<疑似路径>" src/ | grep -v "app/api"
```

**2026-09-26 实际查到的**：`POST /api/admin/upload` 零引用、往 `public/uploads/` 写文件
（Vercel 文件系统只读 → 线上必然 500）、且 `path.extname(file.name)` 用户可控。
**这种「坏掉的 + 没人用的 + 有攻击面」的接口，直接删**，别想着修 ——
真需要上传时菜品图走的是前端 Canvas 压 base64（`src/lib/image-utils.ts`）。

删除路由后**必须** `npx rimraf .next/types .next/dev`：
Next 的 `validator.ts` 会留着已删路由的 import，让 `tsc` / `next build` 报
`Cannot find module '.../route.js'`。**不清就一直是假失败。**

### 8. 限流

登录入口没限流等于把口令爆破的门开着。用 `src/lib/rate-limit.ts`（进程内滑窗，零依赖）。

**阈值要按维度分开定**，别一个数字套所有：
- **按 IP 放宽**（20/15min）：场馆所有收银机通常同一个出口 IP，店员手误几次就锁 15 分钟
  是不可接受的运营事故
- **按用户名收紧**（10/15min）：针对单个账号连续试口令才是爆破特征

⚠️ **必须如实说明它的局限**：Vercel serverless 每实例一份内存，N 个实例 ≈ N 倍配额，
冷启动清零。它能挡脚本小子，挡不住分布式慢速撞库。要强限流得上 Redis / WAF。
**别在汇报里把它说成「已防爆破」。**

### 9. 死素材 / 孤儿文件

```bash
# 源码里引用过的素材名
#   media.ts 里是 p('base', w, h)；别的地方是 '/media/xxx'
# 与 public/media 实际文件对账，差集就是孤儿
```
完整口径与脚本见 skill `fishpond-media-pipeline` 的「素材入库」与「零散坑」。

**处置原则**：`public/` = 站点**实际会加载**的东西。
- 推导出来的派生物（通栏图 / 卡片竖版 / 底纹 / 隐私贴纸）→ **移到 `docs/media-archive/`**，
  不要直接删：它们能从原片重生成，但删了就没了，而且用户可能后续想换版式
- **只移动不删除**，然后如实告诉用户「如需彻底删除我可以再删」
- ⚠️ **视频中间帧（`vid*.jpg` / `vidt*.jpg` / `_endcard-*` / `_video-plan.json`）不要动** ——
  它们是 `_media-derive.py` / `_media-video.py` 的输入输出，挪走会打断重生成流程
- 移完**必须同步两处**：`public/media/manifest.json`（裁剪到只描述还在的）+ 方案板
  `docs/media-preview.html`（内嵌清单整行重嵌 + 图片路径重定向 + KPI 数字）

### 10. 不要顺手做的事

- **不要裁 i18n 的 key**。用字符串匹配扫出来的「未使用 key」里，
  `about.step1Text`（`` t(`about.step${i}Text`) ``）、`pondRules.*` 这类**动态拼接**占大头。
  2026-09-26 扫出 92 个「确定未使用」，人工核完发现基本都是动态键 —— 剪了就是白屏。
  要裁必须先做 AST 级分析。**这条目前是「已知不做」，不是「忘了做」。**

## 验证怎么写（对共享生产库尤其重要）

改完鉴权必须跑**正反两面**，用一次性脚本：

```bash
node -r dotenv/config .workbuddy/_tmp/_verify-authz.cjs
```

要点：
1. **正例**：本人查自己的数据 → 200
2. **反例**：不带头 → 401；借用他人 id → 403；`?phone=` → 401
3. **格式校验**：非法手机号 → 400
4. **错误体断言**：`!/prisma|sql|constraint|column|relation/i.test(body)`
5. **自清**：`try { … } finally { 按 id 精确 deleteMany }`，并在结尾**断言删干净**
6. 测试数据用**一眼看得出是测试的**值（如手机号 `0000000001`、姓名 `ZZTEST-…`）
7. 服务端限流有副作用：**先跑正常登录，再跑错误口令洪水**，否则自己会被 429 挡住
8. 打印 cookie 时**只打前 26 个字符**，别把整个会话打到日志里

## 本机踩坑（这次新发现的）

| 现象 | 解法 |
|---|---|
| node 里 `child_process` 调 git / cmd → `spawnSync … EBUSY` | 沙箱拦 node 起进程。**git 一律在 Bash 工具里直接跑**，node 只做纯文件/网络活 |
| node 里用 `execSync('git ls-files …')` | 同上，先把清单重定向到文件（`git ls-files > x.txt`），再让 node 读文件 |
| bash 内联 `node -e` 里带 `\s` / `\|` / 引号的正则 | Git Bash 会剥引号 → 语法错误。**写成 `.workbuddy/_tmp/*.cjs` 再跑** |
| `[System.IO.Directory]::Delete($p,$true)` 返 1 但目录还在 | 先 `[System.IO.File]::Delete()` 删掉里面的文件，再 `Delete($p,$false)` 删空目录 |
| 删了路由后 build 报 `Cannot find module .../route.js` | `npx rimraf .next/types .next/dev`（别 `rm -rf`，safe-delete 会拦） |
| 长命令 grep 整个仓库超时 / SIGTERM | 用 **Grep 工具**代替 shell grep；或用 `--include` 收窄 |
| `git commit --no-verify=false` 报 `option 'no-verify' takes no value` | 它是个**开关**不是取值选项，要勾钩子就别加，别加 `=false` |
| `next build` 日志里迟迟没有 `build-exit=` | 非 TTY 下日志结束时才落盘。**看到 `Compiled successfully` 也先别当成功**，等 `build-exit=0` 出现再判 |

## 线上复验基线（2026-09-26 实测，可直接当回归断言）

部署后把下面这段整跑一遍，任何一条不符就是回退了。`B=https://hookfishpond.com`

| 请求 | 期望 | 说明 |
|---|---|---|
| `curl -sD- -o/dev/null $B/zh` | 5 个头都在 | `X-Frame-Options: DENY` / `X-Content-Type-Options: nosniff` / `Referrer-Policy` / `Permissions-Policy` / `Content-Security-Policy: frame-ancestors 'none'; …`；且**不应**出现 `X-Powered-By` |
| `$B/api/bookings?phone=0812345678` | **401** | 改前是 200 + 全量数据 |
| `$B/api/orders?phone=0812345678` | **401** | 同上 |
| `$B/api/bookings?userId=clxnotareal` | **401** | 无 `x-user-id` 头 |
| `$B/api/orders?userId=clxnotareal` | **401** | 同上 |
| `$B/api/bookings`（无参） | **401** | |
| `-H 'Cookie: admin-session=clxnotarealid' $B/api/admin/auth/me` | **401** | 旧实现下这个会变管理员 |
| 同上 `$B/api/admin/menu/items` | **401** | |
| `$B/api/admin/menu/items`（无 cookie） | **401** | |
| `$B/api/menu/items` · `/api/ponds` · `/api/tables` · `/api/closed-days` | **200** | 公开接口**不能**被误伤 |
| 页面 `/zh` `/en` `/th` `/zh/about` `/th/about` `/zh/pond-rules` `/zh/menu` `/zh/booking` `/zh/admin` `/en/admin` `/th/admin` | **200** | |
| `/t/A01` | 307 → `/zh/menu?table=A01` → 200 | 短链 |
| `node scripts/check-i18n.mjs --live --base $B` | 60 页零串味、978 键 ×3 | 安全加固不该碰文案，跑一遍确认没误伤 |

⚠️ **别在生产上测管理员登录**：会消耗限流配额、且需要真实口令。本地 3100 测完即可。

### 清理的「减法」要算清账
- **重命名 ≠ 删体积**：把 `public/media/x.jpg` 移到 `docs/media-archive/x.jpg`，
  同一个 blob 在新旧路径各有一个引用，**git 对象库一点没变小**。已在历史里的东西不可能靠改路径抹掉。
  所以「移到 archive 并提交」的收益是**工作树变干净 + 站点不再打包它**，不是省仓库体积 —— 汇报时别吹成「省了 36MB」。
- 真正省体积的只有：**删掉从未提交过的文件**（这次的 `docs/media/` 36MB 死副本）、
  写 `.gitignore` 拦住未来的派生物、以及从 `public/` 移除让**构建产物**变小。

## 汇报格式（用户要的是决策依据，不是漏洞清单）

按**严重度**分组，每条给：是什么 / 影响什么 / 我怎么修的 / 还要你做什么。

必须**分开**写清三类，别混在一起：
1. **已修**（附验证证据：哪几条 curl 从什么码变成了什么码）
2. **需要你决策**（给选项 + 代价 + 我的建议）。典型：轮换管理员口令、上 OTP
3. **已知但这次没动**（附原因）。典型：i18n key 裁剪要 AST 分析、
   `GET /api/orders/[id]` 是「能力 URL」模式（凭 cuid 读单，已做手机号遮罩）、
   Omise 模块预留未接线

⚠️ 不要把「已缓解」说成「已修复」。`x-user-id` 可伪造这件事，无论怎么加校验都还在，
如实说「这仍是缓解，真正的修法是 OTP」。
