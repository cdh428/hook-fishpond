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

### 3.4 恢复已取消订单：**状态、预占、回补**三件事必须一起做

- **现象**：后台误点了「取消」，订单从列表里消失；即便把 `status` 改回 `PENDING`，
  菜品也不占库存了，可能出现**超卖**。
- **根因**：`releaseOrderStock()` 取消时做了两件事 —— `reservedQty` 归零、
  对「已扣减部分」写 `CANCEL` 流水回补。只改 `status` 等于两件都没逆回来。
- **可用量口径**：`stockQty − Σ(其他未取消订单的 reservedQty)`。预占为 0 →
  这桌的菜不占位，别桌可以把它卖掉。
- **正确做法**：`restoreOrderStock()`（`src/lib/stock.ts`），三步：
  1. 按「菜品 + 选项键」逐行把 `reservedQty` 写回数量（库存按**菜品**汇总校验，
     预占必须**逐行**写 —— 同菜品多行时按菜品写会翻倍）；
  2. 冲销取消写的 `CANCEL` 分录（置 `voidedAt`），再补一条 `SALE` 把库存扣回去
     —— 保留完整来龙去脉，不要直接删分录；
  3. `stockConsumedAt = null` —— 否则结算时被幂等守卫跳过 → **漏扣库存**。
- **拒绝方式**：库存不足时**整单拒绝**（抛 `InsufficientStockError` → 400），
  不做「部分恢复」。路由动作：`PATCH { action: "restore", status }`，仅对 `CANCELLED` 生效。
- ⚠️ 取消接口对 `CANCELLED` / `SETTLED` 一律返回 `Order is already closed`，
  所以**恢复不能复用 `status` 动作**，必须是独立动作。

### 3.5 误删订单时先查「是软删还是物理删」

- 本项目的「删除」= 改 `status = CANCELLED`，**数据一行不丢**，不必去翻备份。
- 排查顺序：① 查订单是否还在、状态是什么 → ② 查 `StockMovement` 有没有 `CANCEL`
  分录（判断是否真回补过库存）→ ③ 查 `reservedQty` 是否被清零。
- 若「无任何流水 + `reservedQty` 全 0」= 下单只预占、未扣减，恢复时**不用回补**，只需重建预占。

### 3.6 「算钱」的字段有多条路由时，全库先数有几条再改

**现象**：顾客端扫到「总额」码、后台扫到「差额」码，同一张单两个金额。

**根因**：PromptPay 收款码有**三条**路由各自生成、金额口径不一致——
`POST /api/payments`（顾客下单）用 `order.totalPrice`（总额）；
`GET /api/payments/[id]`（顾客支付页轮询）跟着前者；
`POST /api/admin/orders/[id]/settle`（后台收银）才用 `remaining`（需付差额，对）。
三条各算各的，就必然打架。

**改之前必做**：
1. `grep -rn "generatePromptPayQR\|<算钱函数>" src/app/api` 数清**有几条**路由在算这个钱；
2. 逐条看它取的是「总额」还是「差额」，确认哪条是基准（通常是带 `sumCollected`/`prepaid` 的那条）；
3. 把所有入口统一成**同一个 lib 函数**（本项目基准是 `remaining = max(0, totalPrice − sumCollected)`），
   别让每条路由各写一份 `totalPrice − prepaid` 的算术——将来口径一改就漏。

**别做的**：
- **别物理删路由「收敛成一条」**——先分清鉴权边界：顾客端 `POST/GET /api/payments` 是**公开无鉴权**接口，
  后台 `settle` 是 `requireAdmin`。权限模型不同，删了顾客端就瘫。要收敛的是**算法**，不是**入口数**。
- 改完必查：库存会不会双扣（本项目 `consumeReservation` 有 `stockConsumedAt` 幂等，不会）；
  日报/对账营收口径是不是 `SUM(Order.totalPrice)`（是则不受差额改动影响，但 `Payment.amount` 会变差额）。

**通用教训（跨项目）**：凡是「金额/库存/数量」这类要跨页面一致的字段，
多入口（多路由/多组件）最容易各算各的。改动前先**全库搜一遍有几条入口**，统一到一个函数，
别假设「应该只有一处」。

### 3.7 改「收款金额口径」会砸到仪表盘/报表营收——改前先跑影响面扫描

**现象**：顾客付完款，仪表盘「今日收款」数字不对/不更新。

**根因**：仪表盘 `todayRevenue` 原来查 `SUM(Payment.amount)`。而 §3.6 修复把
`Payment.amount` 从「订单总额」改成了「本次补差额 remaining」——**语义变了**，
但仪表盘没跟着改，于是「今日实收」查出来的是"补差那一笔"，漏掉了早先收到的部分付款。

**正确口径**：
- **今日进入收款 = Σ 当天有效 `PaymentRecord`（现金流实收，含部分付款早先收的）**
- **进行中订单待收 = Σ 未结清单的需付差额（totalPrice − 已付流水）**
- **今日预计收入 = 进入收款 + 进行中待收**
- `Payment.amount` 现在存的是差额，**别再用它算营收**；流水表 `PaymentRecord` 才是钱何时以何方式实收的唯一真相。

**改这类东西前的铁律**：跑 `node scripts/scan-impact.mjs <字段>` 把关联点全扫出来，
逐条判断（路由/前端/报表/schema），**别改一处就推**。特别留意"字面不重名但同笔钱"的报表统计。
（跨项目版见 skill `impact-analysis-before-edit`。）

### 3.8 「需付」= totalPrice − 已付，不是 subtotal，也不是 totalPrice

**现象**：FP-20261018-003 订单（小计 275 + 渔获费 96 = 总应付 371，已付定金 75），
后台订单列表的「小计 275」和「完结应付 275」被客户当成「需付」，但真需付是 **296**（371−75）。

**根因**（两处，都在 `admin/orders/page.tsx`）：
1. 卡片/完结弹窗把 `subtotal`（菜价小计）渲染在「主金额/应付」位，客户以为就是需付；
2. 完结弹窗 `SettleSheet` 的 `receivable = current.totalPrice`（371）**没减已付 75**，
   而服务端 `settle` 的 `res.amount` 却是 296（算对了）——**弹窗主金额与收款码不一致**。

**正确口径**（三层必须统一为同一公式）：
- **需付 = max(0, totalPrice − 已付流水/`prepaidAmount`)**（本例 = 371−75 = 296）
- `subtotal` 只是「菜价明细」，永远不能当需付；`fishCharge` 已含在 `totalPrice` 里。
- 任何界面展示「需付/应付/收款码金额」，都必须用 `totalPrice − prepaid`，
  并与服务端 `/settle` 的 `res.amount` 同口径（`scan:impact "PaymentRecord"` 可核对涉及点）。

**防再犯**：改订单页任何金额显示前，先确认那个数是不是 `subtotal`；
「应付类」金额一律减已付；改完跑 `node scripts/check-dashboard.cjs` 对照线上 stats 同口径。

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

### 6.4 手机不能直连这台蓝牙打印机（别白费力气）

- **现象**：想在手机上「搜索并连接打印机」，搜不到 / 连上了也没法打印。
- **根因**：`GLPrinter` 是**经典蓝牙（BR/EDR）SPP**，注册表里只有
  `BTHENUM\{00001101-0000-1000-8000-00805F9B34FB}\...`，**没有任何 BTHLE 条目**。
  而 **Web Bluetooth 只支持 BLE 设备**（GATT 服务），根本发现不了经典蓝牙；
  iPhone 的 Safari 则是**完全不支持** Web Bluetooth。
- **正确做法**：手机也必须**经过打印桥转发** —— 手机连电脑上的桥，电脑再用 USB/蓝牙发出去。
  桥默认监听 `0.0.0.0`，手机在同一 Wi-Fi 下把「打印服务地址」填成电脑的局域网 IP 即可
  （`/health` 的 `lanUrls` 会回报，设置页可直接点选）。
- **怎么判断一台蓝牙机是经典还是 BLE**：
  `Get-ChildItem HKLM:\SYSTEM\CurrentControlSet\Enum\BTHLE` 里有它就是 BLE；
  只在 `BTHENUM` 下有 `{00001101...}` 就是经典 SPP。

### 6.5 打印配置绝不能按设备各存各的

- **现象**：手机上调好了，电脑上又不对；每换一台设备就要重配一遍。
- **根因**：配置存 `localStorage`，而且是**具体端口号 / 打印机名**（`COM8`、`POS80`）。
  端口号天然绑定某台机器，跨设备必然失效。
- **正确做法**：存**数据库**（`Setting` 表，`print.preferences` 键），且存的是
  **通道偏好**（`usb` / `bluetooth` / `auto`）而不是端口号。
  实际投递时由「当前连的是哪台桥」决定落到哪个目标，偏好只表示「优先走哪条通道」。
- **例外**：桥地址（`hf.print.bridgeUrl`）仍存本机 localStorage ——
  它本来就是「这台设备怎么找到桥」，手机要填电脑局域网 IP，共用反而会坏。

### 6.6 同一台打印机被识别成两个目标

- **现象**：列表里同时有 `POS80`（USB）和 `GLPrinter (COM8)`（蓝牙），其实是同一台机。
- **不要按驱动名归组**：实测 `Microsoft IPP Class Driver` 被 Brother / TOSHIBA / EPSON
  三台**不相干的**打印机共用，按驱动归组会把它们合并成一个，比不归组更糟。
- **现在只认一条线索**：蓝牙串口的 MAC 与另一目标的 MAC **完全一致**才归组。
  名字完全不同的（`POS80` ↔ `GLPrinter`）不做自动推断 —— 由用户在设置页手动指定。
- 另：未识别蓝牙设备的 MAC 是 `000000000000`，必须排除，否则全部被归成一组。

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
