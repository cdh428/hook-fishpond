# 踩坑手册（Gotchas）

> 目的：**同一个坑不要踩第二次。**
> 每条都写清「现象 → 根因 → 正确做法」，全部是真实踩过的，不是假设。
>
> 相关文档：
> - 推送与验证 → [`push-checklist.md`](push-checklist.md)
> - 部署与备份 → [`deploy-and-backup.md`](deploy-and-backup.md)
> - 密钥处理 → [`secrets-handling.md`](secrets-handling.md)

---

## 一、国际化 / 泰文

### 1.1 泰文不能靠模型「生成」，必须用原文 ✅ 最重要

- **现象**：页面上泰文看着是泰文，但母语者一眼看出声调符号被换掉、元音丢了。
  实例：`ประกาศปร้บราคาและการใหบรการ`（正确 `ประกาศปรับราคาและการให้บริการ`）、
  `ปลาซวย`（正确 `ปลาสวาย`）、`ส่วนฟร`（正确 `ส่วนฟรี`）。
- **根因**：模型生成的泰文会系统性丢失 / 替换声调符号与元音。
  **从用户或现场公告直接复制的泰文则完好** —— 差别就在「来源」。
- **正确做法**：
  1. 泰文一律以**用户提供的原文**为准，不要自己「翻译成泰文」。
  2 新增泰文 key 时，优先复用公告原文里已出现的词句。
  3. 提交前**人工过一遍**：用 Grep / Read 看泰文（它们返回正常 UTF-8）。
- ⚠️ `node scripts/check-i18n.mjs` **只校验三语键对齐，查不出拼写**，不要以为它过了就没问题。

### 1.2 改泰文用脚本，别用文本编辑器工具

- **现象**：直接对含泰文的行做精确替换，容易匹配失败（声调符号的码点组合不一致）。
- **正确做法**：用 Python + `json` 模块按 **key 定位**改，`ensure_ascii=False` 写回，写完 `json.loads` 复验。
  改完用 Bash 核对时**只看行数 / 字节数**，别看内容（Bash 输出中文泰文会乱码，见 4.4）。

---

## 二、图片 / 前端渲染

### 2.1 图片不要用「SSR 隐藏 + onLoad 显示」

- **现象**：图片文件已上传、CDN 访问 200、页面 HTML 里也有 `<img>`，但**页面上就是看不到**。
  查看 SSR 产出的标签：`<img src="..." style="display:none"/>`。
- **根因**：SSR 吐出的 HTML 本身就是隐藏的；而 `onLoad` 存在**竞态** ——
  图片在 React hydration 绑定事件之前就加载完成（缓存命中时必然如此），事件不触发，
  于是图**永久**停在 `display:none`。
- **正确做法**：**直接正常渲染** `<img>`。要懒加载就加 `loading="lazy"`；
  要占位就用 CSS 背景。**不要把可见性交给 `onLoad`。**
- **排查手法**：
  ```bash
  curl -s https://www.hookfishpond.com/zh | grep -o '<img[^>]*notice[^>]*>'
  ```
  一眼就能看出 SSR 出的标签有没有 `display:none`。

### 2.2 `'use client'` 不会出现在 SSR 产出的 HTML 里

- **坑**：想判断某个页面是不是客户端组件，去抓线上 HTML 搜 `use client`，搜不到就以为它是服务端组件 —— **结论是错的**。
- **正确做法**：直接看源码文件头部有没有 `'use client'`。

---

## 三、业务逻辑（改之前务必看）

### 3.1 未结清单据**绝不能**按日期过滤

- **现象**：昨天开的桌、没结账，第二天在后台订单页**消失了**，钱收不到也结不掉。
- **根因**：订单页默认 `todayOnly = true`，且该开关**对「进行中」标签页也生效**，
  请求 `scope=today`（曼谷当天）→ 跨天未结的单被过滤掉。
- **正确做法**：「进行中 / 待收款」用 `scope=unsettled`（`status notIn [SETTLED, CANCELLED]`，**不加日期限制**）；
  只有「已结清 / 已取消」才按日期筛。见 `src/app/api/admin/orders/route.ts`。

### 3.2 称重是「5 行制」，免重是**限额行**不是全局抵扣

- **规则**：第 1 行 = 免重（`fishTier = 0`，只记录、**不计费**，累计不得超过总免重）；
  第 2–5 行 = 50 / 60 / 80 / 100 ฿ 四档，每行「公斤数 × 档价」，**此处不再扣免重**；
  渔获费 = 四档金额加总。
- **踩过的错**：一开始写成「总重 ≤ 免重 → 0，否则全部按档价」（全局抵扣）—— 被否掉，重做。
- **免重额度** = 总杆数 × 1 kg；超出时提示「拿出一条鱼」。

### 3.3 鱼竿识别**只按菜单项名称**，不能按价格

- **根因**：100 / 150 这两个价格**不唯一**（烤虾 150、鱿鱼 100），按价格判断会误判。
- **正确做法**：走 `src/lib/orders.ts` 的 `isRodItem()` / `countRodsFromItems()` 三语名称表。
- 另注：同一桌可以**同时**有自带竿（100）和租竿（150），不是二选一。

---

## 四、本机 / 工具链

### 4.1 Prisma 7 必须用 driver adapter

- **现象**：临时脚本里 `new PrismaClient()` 报
  `PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions`。
- **正确做法**：照 `src/lib/prisma.ts` 用 `PrismaPg`：
  ```js
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { PrismaClient } = require('@prisma/client');
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL || '',
    ssl: { rejectUnauthorized: false }, max: 1,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 20000,
  });
  const prisma = new PrismaClient({ adapter });
  ```

### 4.2 `next build` 要加前缀，否则误报失败

- **现象**：编译全过，最后 `> Build error occurred`、退出码 1，看着像代码错。
- **根因**：收尾清理 `.next` 时撞上 safe-delete 的单轮上限。
- **正确做法**：`CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build`

### 4.3 临时脚本用 `.cjs`，并先加载 env

- `.mjs` 是 ESM，里面写 `require(...)` 会 `ReferenceError`。
- 独立脚本**不会**自动读 `.env.local`，必须先：
  `require('dotenv').config({ path: '.env.local' })`
  且要在**创建 PrismaClient 之前**（见 4.1）。

### 4.4 Bash 输出里的中文 / 泰文是乱码，不能用来核对文案

- **正确做法**：核对文字用 **Grep / Read** 工具（正常 UTF-8），
  或写 node/python 脚本断言 `includes()`。
  Bash 只用来判断「行数 / 字节数 / 是否存在」这类与文字无关的事。

### 4.5 git 只 `add` 明确路径

- **背景**：本仓库可能同时有别的会话 / 未完成的产物目录。
- **铁律**：`git add <具体文件>`，**绝不** `git add -A` / `git add .` / `git commit -a`。
  提交前 `git diff --cached --stat` 逐个确认。看到陌生改动不要去提交、revert 或 stash。

---

## 五、部署与验证

### 5.1 推送走三层凭据链

`bash scripts/push-main.sh` —— 正常情况下第 ① 级 **SSH Deploy Key** 就免密成功。
不要手动 `git push` 折腾凭据。

### 5.2 Vercel 上有 3 个僵尸项目，只认一个

- 生效的是 **`hook-fishpond-xi15`** → https://www.hookfishpond.com
- `hook-fishpond` / `hook-fishpond-1eyy` / `hookfishpond1` 是**僵尸项目，别去动**。

### 5.3 验证部署看「内容」，别看 chunk hash

- chunk 结构改过，`/_next/static/chunks/app/layout-*.js` 的 hash 已不可靠。
- **正确做法**：抓页面 HTML，搜一个本次新增的 i18n key 或新文案，出现即为新版本已上线。
  ```bash
  curl -s https://www.hookfishpond.com/th | grep -c "本次新增的泰文文案"
  ```
- 注意根域名会 308 跳到 `www.hookfishpond.com`，直接打 www。

---

## 六、打印（小票机）

### 6.1 打完不切纸 / 一直吐长纸

- **现象**：一张单打完，机器继续吐空白纸，纸越拉越长，或者干脆不切。
- **根因**：旧实现用 `GS V 66 n`（进纸后**半切**）。两个坑叠在一起：
  ① `n` 的单位是「**点**」（一行点阵只有几十点高），传 `n=66` 几乎等于立即切，起不到留边作用；
  ② 不少机型**不认** `66` 这个子命令，整条指令被忽略 → 完全不切。
- **正确做法**：默认改 `GS V 0`（全切，`1d 56 00`，兼容性最好），走纸改成显式 `feedLines`。
  当前默认 `feedLines: 6`（一行 ≈ 4mm，约 24mm）。
- **调参**：切在字上 / 切不断 → **调大 `feedLines`**；机型只支持半切 → 试 `cutMode: "partial"`。
- 见 `tools/print-bridge/config.json` 与 README 的「切纸参数」表。

### 6.2 蓝牙打印机「连不上」——先查服务是否在跑

- **现象**：后台点打印没反应，`/admin/print` 显示未启动，或选不到 GLPrinter。
- **根因**：**打印桥（`bridge.py`，127.0.0.1:17777）没有运行**。
  桥不在 → 网页自动退回浏览器对话框，蓝牙根本无从投递。
- **正确做法**：把 `HookFishpond-PrintBridge.vbs` 放进 Startup 文件夹做开机自启
  （模板见 `tools/print-bridge/HookFishpond-PrintBridge.vbs.example`，**要改里面的实际路径**）。
  日志在 `tools/print-bridge/bridge.log`。
- 排查顺序：`curl 127.0.0.1:17777/health` → `bridge.py --list` → 打印机是否开机 →
  「蓝牙和其他设备 → 更多蓝牙选项 → COM 端口」里 GLPrinter 对应哪个 COM 口。

### 6.3 蓝牙机是 **COM 口**，不是打印机名

- 蓝牙小票机在 Windows 上通常**不进打印机列表**，只暴露一个 SPP 虚拟串口（如 `COM8`）。
- 选目标时必须选 **`GLPrinter (COM8)`** 这种串口项；填裸名 `GLPrinter` 会报「目标不存在」。
- 本机实例：GLPrinter → `COM8`；USB 机 `POS80` 走打印队列。

### 6.4 `defaultPrinter` 别写死蓝牙口

- **踩过**：`config.json` 里 `defaultPrinter: "COM8"`。蓝牙一关机，**所有**单据都发不出去。
- **正确做法**：默认指向稳定的 USB 机（`POS80`）。
  蓝牙失败时前端会自动改投另一台热敏机，并提示「蓝牙未响应，已改走 POS80」。

### 6.5 蓝牙链路是好的，别急着重配对

- 实测 `CreateFile("\\\\.\\COM8")` 能成功打开，说明 SPP 端口与配对都正常。
- 遇到「连不上」先按 6.2 的顺序排查，**不要**先删设备重配对（会把 COM 口号变掉）。
- 另设了通讯超时（写 15s / 读 2s）：不设超时的话，蓝牙断链时 `WriteFile` 会一直阻塞，
  界面表现是「点了打印没反应」。

### 6.6 Agent 起的后台进程会被回收

- 用 Bash 后台起的 `bridge.py`，父进程是工具 shell，**会话结束可能被一起回收**，
  表现为「日志说已就绪，但端口拒绝连接」。
- 要长期在跑，只能放 **Startup 文件夹**（explorer 登录时拉起），不要靠 Agent 后台任务。

---

## 七、改动前的自检清单

- [ ] 涉及泰文？→ 用的是原文吗？人工看过吗？
- [ ] 动了图片渲染？→ 有没有把可见性交给 `onLoad`？
- [ ] 动了订单查询？→ 未结清单据还会被日期过滤吗？
- [ ] 改了 `messages/*.json`？→ 跑 `node scripts/check-i18n.mjs`
- [ ] 改完构建？→ `CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build`
- [ ] 提交前？→ `git diff --cached --stat` 逐个确认，没用 `git add -A`
- [ ] 推完？→ 抓页面内容验证，而不是只看「推送成功」
- [ ] 有临时脚本 / 临时文件？→ 用完删掉，别提交
