# 语言一致性（全站输入 / 输出）

> **一条铁律：用户在哪个语言页面操作，系统的输出与提示就用哪个语言。**
> 没有页面的场景（cron / webhook / 自动出单）按服务端配置，缺省泰文。
>
> 打印票面是这条规则的一个特例，细则见 `docs/playbooks/print-language.md`。
> 本文管其余全部：报表导出、Excel 导入导出、接口错误、结算提示、推送。

---

## 一、语言从哪来（三层，按优先级）

| 层 | 来源 | 适用 |
|---|---|---|
| **1. 显式传参** | 前端把 `useLocale()` 放进 body / query / FormData 的 `locale` | 所有可交互的请求 |
| **2. `Referer` 路径段** | 从 `…/zh|en|th/…` 提取 | 下载类请求（`<a href>` 没有 body，只能靠它） |
| **3. `Accept-Language`** | 浏览器首选语言 | 兜底 |
| **4. 服务端配置** | `Setting.print.locale` / `LINE_REPORT_LOCALE`，缺省 `th` | **无页面**场景：cron、webhook、自动出单 |

实现：`src/lib/server-t.ts`
```ts
const locale = requestLocale({ bodyLocale, queryLocale, request }); // 1-3
const t = await serverT(locale);                                    // 复用 messages/*.json
```

⚠️ **兜底永远是 `zh` 的地方只适用于「有页面」场景**。cron / 定时任务必须显式读配置，
否则会重演 `print/watch` 写死 `zh` 的坑（`print-language.md` §4.1）。

---

## 二、各类输出的规则

| 输出物 | 语言来源 | 代码位置 |
|---|---|---|
| 小票 / 厨房单（手动） | 页面语言 | `src/lib/print-receipt.ts` + `PrintLabels` |
| 小票（自动出单） | `Order.locale`，历史单回退 `print.locale` | `api/admin/print/watch/route.ts` |
| **报表导出 Excel/CSV** | `?locale=` → Referer | `api/admin/reports/export/route.ts` |
| **菜单导出 / 模板** | `?locale=` → Referer | `api/admin/menu/{export,template}/route.ts` |
| **菜单导入预览 / 提交** | FormData / body 的 `locale` | `api/admin/menu/import/**` |
| **下单 / 结算 / 建单错误** | body 的 `locale` → Referer | `api/orders`、`api/admin/orders/**` |
| LINE 日报 | `body.locale`（页面）→ `LINE_REPORT_LOCALE`（cron） | `api/admin/line` + `lib/daily-report.ts` |
| LINE webhook 回复 | `LINE_REPORT_LOCALE`（无页面，缺省中文） | `api/webhooks/line/route.ts` |
| 库存台账 / 进货 / 盘点错误 | `i18nKey` + 路由出口 `t()` | `lib/stock-ledger.ts` `ledgerErrorResponse` |
| cron 鉴权提示 | `Referer` / `Accept-Language`（管理员在浏览器打开时看） | `api/cron/*/route.ts` |
| 收银机语音播报 | 桥侧 `sound_announcer.py`（泰语第一句 + 中文第二句，固定双播） | `tools/print-bridge/` |
| 下载失败提示 | 同上（返回 HTML，不是 JSON） | `src/lib/download-error.ts` |

---

## 三、四条代码铁律

### 3.1 服务端不写中文字面量，一律 `t()`

```ts
// ❌ 英文页面会看到中文
return NextResponse.json({ error: `${itemName} 库存不足` });

// ✅
const t = await serverT(reqLocale);
return NextResponse.json({ error: t("apiErr.insufficientStock", { item: itemName }) });
```

新增文案放 `messages/{zh,en,th}.json`，三语严格对齐（`npm run check:i18n`）。
现有命名空间：`apiErr`（接口错误）、`menuIo`（菜单导入导出）、`reportExport`（报表导出）、
`enumLabel`（枚举人话）。

### 3.2 错误对象只带 `code` + 参数，文案在出口处渲染

`OptionError` 之类不要用 `humanMessage`（写死中文）返回给客户端 ——
用 `messageKey` + `t()`。`humanMessage` 已标 `@deprecated`，仅供服务端日志。

**lib 层抛错同样受这条约束**（`StockLedgerError` 是范例）：

```ts
// lib/stock-ledger.ts —— 三种语言都带上，出口再挑
throw new StockLedgerError(
  "STOCK_TYPE_NOT_TRACKED",
  `${item.name_zh} 未启用库存管理（请先把库存类型设为外购）`, // 仅日志/兜底
  400,
  "stockErr.stockTypeNotTracked",
  { item: { zh: item.name_zh, en: item.name_en, th: item.name_th } },
);
```

```ts
// 路由层：第三个参数传 request 才有语言可认
return ledgerErrorResponse(error, "Create purchase receipt error", request);
```

`ledgerErrorResponse` 会 `await serverT(requestLocale({ request }))` 渲染
`stockErr.*`；**key 不存在时回退 `error.message`**（新增错误码不会让接口 500）。
`message` 里仍写中文也无所谓 —— 它只进日志，不进响应。

### 3.2.1 落库文案 vs 屏幕文案（2026-11-07 决策）

有些中文是**写进数据库的业务摘要**，不是界面文案，按语言翻译反而会让账本
在切语言后语义漂移。以下**故意保持中文**：

- `PaymentRecord.note`：`线下退现`、`结清·补差`
- 补录订单的客户名 `补录`
- 库存台账 `note` / `reason`：`进货单 PO-xxx`、`盘盈/盘亏`、`红字冲销`

判断标准：**这条字符串会不会被别的系统/对账视图当作关键词？** 会 → 不翻译。

### 3.3 枚举值必须翻译，不能把 `SETTLED` / `PROMPTPAY` 直接甩给用户

用 `enumLabel.orderStatus.SETTLED` 这类 key。导出表格里尤其明显：
老板看到的「状态」列要是人话，不是数据库枚举。

缺 key 时**原样返回枚举值**，不要抛错（新增枚举值不该让整个导出 500）。

### 3.4 导入匹配集必须接受三语

导出用当前语言写表头/分类名，导入若只认中文，用户就会看到
「缺少必需的列」——而那份文件正是本系统自己导出的。

- 列名：`MENU_COLUMNS` 每项带 `header: {zh,en,th}`，`HEADER_INDEX` 建三语索引
- 分类名：`catByName` 同时索引 `name_zh / name_en / name_th`
- 布尔/枚举：`parseBool` / `stockType` 兼容 `是/Yes/ใช่`、`不管理/Not tracked/ไม่จัดการ`

### 3.5 聚合查询要多查语言列，别只 `name_zh`

报表 SQL 原来只 `SELECT mc."name_zh" AS category` —— 于是英文/泰文后台的
「分类占比」永远是中文分类名。**凡是要上屏的维度名，SQL 里就把三语都取出来**：

```sql
SELECT mc."name_zh" AS category,
       mc."name_en" AS category_en,
       mc."name_th" AS category_th
-- GROUP BY 也要带上这三列，否则 PG 报错
```

取名用 `pickCategory(it, locale)`（`src/lib/report-category.ts`）。

⚠️ **这个纯函数必须单独放一个文件**：`lib/reports.ts` 里 import 了 Prisma，
客户端组件（报表页）一旦从它取名函数，整个 Prisma 会被打进浏览器 bundle。

---

## 四、反模式（都踩过）

| 反模式 | 后果 | 正确做法 |
|---|---|---|
| `toReceiptOrder(order, "zh")` 写死 | 英文页打中文票 | 传 `order.locale` 或页面 locale |
| 用**中文前缀**判断业务状态 `msg.startsWith('已记')` | 文案一翻译，颜色/分支静默失效 | 服务端返回 `ok` 布尔，前端读布尔 |
| 只认中文表头 | 自家导出的英文文件导不回去 | §3.4 |
| 文案里三语硬拼 `"茅草屋 / Cottage / กระท่อม"` | 改 locale 永远修不好 | 每种语言只放自己的字 |
| 下载接口失败返回 JSON | 浏览器显示 `{"error":"导出失败"}` 原文页 | `downloadErrorPage()` 返回 HTML |
| `document.documentElement.lang` 取 locale | SSR 阶段回退 `zh`，水合前后不一致 | `useLocale()` |
| 检测「票面是否含中文」时把 CSS 注释算进去 | 误报 | 先剥离 `<style>` 与注释再判断 |

---

## 五、3 分钟排查

```bash
# 1. 三语 key 是否对齐（串味 / 缺失）
npm run check:i18n

# 2. 服务端还有没有硬编码中文（排除注释）
node -e "
const fs=require('fs');const g=require('child_process').execSync('git ls-files src/app/api src/lib').toString().split('\n').filter(Boolean);
for(const f of g){const L=fs.readFileSync(f,'utf8').split('\n');
L.forEach((l,i)=>{ if(/[\u4e00-\u9fff]/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/console\./.test(l)) console.log(f+':'+(i+1)+': '+l.trim().slice(0,80)); });}"

# 3. 三语实测（起 dev 后）
BASE=http://127.0.0.1:3102 node scripts/verify-lang-consistency.cjs
```

---

## 六、改完验收清单

- [ ] `npm run check:i18n` 通过（无串味、无缺 key）
- [ ] `npx tsc --noEmit` 通过
- [ ] `npx tsx scripts/verify-p1-lang.ts` 通过（日报三语 + 标点）
- [ ] 导出类：访问 `?locale=en` / `?locale=th`，**文件里零中文**
- [ ] 导入类：用英文表头的文件上传，**能正常识别列与分类**
- [ ] 错误类：`locale=en` 触发一次失败，提示是英文
- [ ] 修改文案后，所有依赖该文案的**逻辑判断**（颜色、分支、排序）不再依赖文字内容
- [ ] 无页面场景（cron / 自动出单 / webhook）确认读的是配置，不是写死 `zh`
