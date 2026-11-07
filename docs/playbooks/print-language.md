# 打印语言规则（小票 / 厨房单 / 收据）

> **一句话**：票面语言由**触发打印的那个页面 URL 的 locale** 决定，
> 一处例外 —— **服务端自动出单（打印桥 watch）没有页面，必须由服务端配置决定**。
> 任何"某个语言页面打出中文"的问题，都按本文件的三条铁律排查。

---

## 一、语言决定规则（唯一口径）

| 打印来源 | 语言取自 | 实现位置 |
|---|---|---|
| 顾客端订单详情（手动） | 当前页面 URL 的 locale | `src/app/[locale]/orders/[id]/page.tsx` → `toReceiptOrder(order, locale)` |
| 后台订单页 / 结算弹窗（手动） | 当前页面 URL 的 locale | `src/app/[locale]/admin/orders/page.tsx` → `toReceiptOrder(order, locale)` |
| 打印设置页「测试打单」 | 页面 locale（**不要读 `document.documentElement.lang`**，见 4.2） | `src/app/[locale]/admin/print/page.tsx` |
| **服务端自动出单** | **无页面 ⇒ 读服务端配置 `print.locale`（缺省 `th`）** | `src/app/api/admin/print/watch/route.ts` |
| 打印桥（`tools/print-bridge`） | **不参与**——它只收已渲染好的 HTML | — |

**为什么服务端自动出单缺省是 `th`**：店员/后厨是泰国人，中文只是老板对账用。
票面语言选错时，后厨看不懂 = 直接出错菜，比老板看不懂严重得多。

---

## 二、三条铁律（踩过的坑）

### 2.1 绝不在 `print-receipt.ts` 里写死中文文案

**踩坑**（2026-11-07 审计）：`src/lib/print-receipt.ts` 第 280/281/297 行硬编码
`✓ 已送` / `⏳ 未送` / `下单 … N 项`，导致**三语页面打出来都是中文**，
而文件头注释却声称「本库不带任何硬编码文案」——注释与实现自相矛盾。

**规则**：`print-receipt.ts` 是纯渲染库，**所有文字必须由调用方通过 `PrintLabels` 传入**。
新增任何文案时，同一次提交里必须同时给 `messages/{zh,en,th}.json` 加 key，
并在每个调用点补上 `t(...)`。缺 key 时**不要用中文兜底**，用空字符串或符号（`·`）。

### 2.2 `kitchenCopy1/2` 等标题不能「泰中双语硬拼」

**踩坑**：`messages/en.json` / `th.json` 里的值是
`【 Kitchen Copy / 厨房留存联 】` —— **英文页和泰文页都会打出中文**。
这不是代码 bug，改 locale 永远修不好，只能改文案。

**规则**：`messages/*.json` 里**不允许出现跨语言混排**（除 `1.1a 故意三语同显` 的豁免 key）。
每条语言的文案只写该语言。

### 2.3 菜名「主语言 + 副行中文」必须由 locale 控制

**踩坑**：`print-receipt.ts:242` 的 `splitBilingual()` 会把菜名里
`（…）` 或 `/ …` 之后的部分**当作中文**强制打成第二行小字。
只要后台录入的是「ปลาย่าง (烤鱼)」这种写法，**泰文页也会多打一行中文**。

**规则**：副行（第二语言）只允许两种来源之一：
- 由调用方显式传入 `subName`（`toReceiptOrder` 已知 locale，能给出正确的副语言）；
- 或仅在 `locale === 'zh'` 时展示中文副行。

**绝不**靠正则从字符串里猜语言。

---

## 三、排查步骤（3 分钟定位）

```bash
# 1) 先确认是哪条路径（手动 vs 服务端自动）
#    手动按钮 → locale 一定来自页面；下单后自动出纸 → 看 watch/route.ts
grep -n "toReceiptOrder" -r src/ | grep -v node_modules

# 2) 找硬编码中文（最容易漏的）
grep -nP '[\x{4e00}-\x{9fff}]' src/lib/print-receipt.ts

# 3) 找 messages 里的跨语言混排
node -e "for(const l of ['zh','en','th']){const m=require('./messages/'+l+'.json');const walk=(o,p='')=>{for(const k in o){const v=o[k];if(typeof v==='object')walk(v,p+k+'.');else if(typeof v==='string'){const zh=/[\x{4e00}-\x{9fff}]/.test(v);if(l!=='zh'&&zh)console.log(l,p+k,'=',v)}}};walk(m)}"

# 4) 实际出纸验证（本地 dev 连生产库 → 看 HTML 而非纸）
#    打印桥的 /print 返回 HTML 渲染结果，可直接目视
```

---

## 四、已知坑位速查

### 4.1 `watch/route.ts` 曾写死 `"zh"`
两行代码（`toReceiptOrder(order, "zh")` + `loadLabels("zh")`）就决定了
**所有自动出单永远中文**，与页面语言完全无关。修复后必须改为读配置。

### 4.2 打印设置页别用 `document.documentElement.lang`
SSR 阶段 `document` 不存在 → 回退 `'zh'` → 水合前后语言不一致。
**统一用 `useLocale()`**（next-intl），与服务端渲染同源。

### 4.3 打印桥没有 locale，别指望它
`tools/print-bridge/bridge.py` 的 `do_print()` 只解析
`html / printer / width / scale / cut / copies / paperWidthMm`。
**语言在 HTML 生成时就固化了**（桥只是把 HTML 截成位图打印）。
想按需切换语言，必须在**发请求前**就渲染好对应语言。

### 4.4 桌号 QR 贴纸是三语同打
`admin/tables/page.tsx` 内联拼的贴纸 HTML 刻意三语全打（顾客扫到时不知道对方用什么语言）。
**这是设计，不是 bug** —— 与厨房单的语言规则不冲突。

### 4.5 死代码别当成活路径
`src/lib/auto-printer.ts`（`useAutoPrinter`）已无调用点（commit `48d1a7c7` 停用），
`print-receipt.ts` 的 `printHtml()`（436-500）同样无人调用。
审计时**先 grep 调用点**再判断，否则会浪费时间修死代码。

---

## 五、改完的验收清单

- [ ] `npm run check:i18n` 通过（三语 key 对齐）
- [ ] `/zh /en /th` 三个语言页各打一次厨房单，票面**只有该语言**（副行中文仅在 zh 页出现）
- [ ] 下单后自动出单的票面语言 = `print.locale` 配置值
- [ ] 打印桥日志里 `billHtml` 长度正常（非空、非报错 HTML）
- [ ] 无新增硬编码中文：`grep -nP '[\x{4e00}-\x{9fff}]' src/lib/print-receipt.ts` 结果为空
