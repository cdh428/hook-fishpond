# 回归测试工作流（财务模块）

**用途**：任何改到「订单/结算/流水/报表/库存」的 PR 合并前，照这份清单跑一遍。
**最后更新**：2026-10-27（审计 agent A/B/C 三路发现 + 修复）
**关联铁律**：`docs/playbooks/finance-rules-cashier.md` §3/§7（实收现金流口径、落日按 paidAt、流水只追加不覆盖）

---

## 0. 触发条件

改到以下任一文件/逻辑，必须跑全套：

- `src/app/api/admin/orders/**`（新建/补录/取消/恢复/退回）
- `src/app/api/admin/orders/[id]/settle/**`（记已付/结清/退款/补录 paidAt）
- `src/app/api/payments/**`（顾客端 PromptPay 凭证）
- `src/app/api/webhooks/omise/**`（旧通道，若启用）
- `src/lib/payment-records.ts`、`src/lib/orders.ts`、`src/lib/stock.ts`
- `src/lib/reports.ts`、`src/app/api/admin/reports/**`、`src/app/api/admin/transactions/**`
- `messages/*.json`（财务相关 key）

---

## 1. 代码级回归（必跑）

```bash
# 1. 编译
CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build
# 2. i18n 对齐（zh/en/th key 数必须一致）
npm run check:i18n
# 3. 密文扫描（提交闸门自带）
git status --porcelain   # 甄别自己改的文件，只 add 自己的
```

---

## 2. 生产黑盒探针（curl，全部落在「被 400/401 拒」路径，不写脏数据）

> 口令从 `.workbuddy/secrets/ADMIN_PASS.txt` 读，**绝不打印**。
> 本机 `curl` 必须加 `--noproxy '*'`（否则走代理假 502）。

### 2.1 健康 & 只读

```bash
curl -s --noproxy '*' https://www.hookfishpond.com/api/health/db
# 期望 {"ok":true,...}
curl -s --noproxy '*' https://www.hookfishpond.com/api/ponds | head -c 200
curl -s --noproxy '*' https://www.hookfishpond.com/api/tables | head -c 200
```

### 2.2 权限护栏（无 cookie → 401）

```bash
curl -s -o /dev/null -w '%{http_code}' --noproxy '*' -X POST \
  https://www.hookfishpond.com/api/admin/orders -H 'Content-Type: application/json' -d '{}'
# 期望 401
```

### 2.3 写前校验护栏（带 admin cookie → 400）

```bash
# 先拿 cookie（口令脱敏）
node scripts/probe-login.cjs   # 产出 cookie 到 $TEMP/probe_cookie.txt
COOKIE=$(cat "$TEMP/probe_cookie.txt")

# 未来日期护栏
curl -s -w '\n%{http_code}' --noproxy '*' -X POST \
  https://www.hookfishpond.com/api/admin/orders \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"items":[{"menuItemId":"nonexistent","quantity":1}],"orderDate":"2030-01-01T00:00:00Z","orderType":"TAKEAWAY"}'
# 期望 400 FUTURE_DATE_REJECTED（护栏先于菜品校验触发）
```

### 2.4 报表数字自洽（只读）

```bash
curl -s --noproxy '*' "https://www.hookfishpond.com/api/admin/reports?range=month" -H "Cookie: $COOKIE"
# 交叉核对：
#   overview.totalRevenue === trend 各点 revenue 之和
#   structure.payments 之和 === overview.orderRevenue
#   差异说明：orderTypes/tables 按 Order 表、orderRevenue 按流水，跨口径差 1 单正常
```

---

## 3. 代码级审计清单（静态查，不跑浏览器）

| # | 检查点 | 文件 | 上次踩坑 |
|---|--------|------|----------|
| 3.1 | 每次写流水后是否 `syncPrepaidFromRecords` | 所有 `addPaymentRecord` 调用方 | — |
| 3.2 | `cancel` 是否同时作废流水 + 置 Payment FAILED | `admin/orders/[id]/route.ts` cancel | P1-3 漏 Payment |
| 3.3 | `restore` 是否 unvoid 流水 + 恢复 Payment PENDING | 同上 restore | P1-3 漏恢复 |
| 3.4 | `reopen` 是否把 Payment SUCCESSFUL 退回 PENDING | 同上 reopen | P0-1 生产复现 |
| 3.5 | `record-prepaid` 的 kind 判定：实收为负（退过款）不能标 DEPOSIT | `settle/route.ts` | P1-4 误标 |
| 3.6 | `admin_confirm` / Omise 成功路径是否补 `addPaymentRecord` | `payments/[id]`、`webhooks/omise` | P1-1 旧通道漏流水 |
| 3.7 | 报表 KPI 数据源是否为 PaymentRecord（不是旧 Payment） | `admin/transactions` | P0-1（报表）旧表残留 |
| 3.8 | 时区落日：所有「天」用 `+7h`（曼谷）偏移，别用 UTC 切 | `reports.ts`、`transactions` | P1-3 曼谷凌晨 7h 划错天 |
| 3.9 | `paidNow` 是否仅限 TAKEAWAY（堂食走正常结算） | `admin/orders/route.ts` | P1-2 补录堂食卡台账 |

---

## 4. 数据级回归（DB 直连，只读）

```bash
node scripts/verify-ledger.cjs
# 校验：
#   a) 已取消订单上的有效流水 = 0
#   b) 每单 prepaidAmount == Σ未作废流水
#   c) 营收(按 paidAt) 与 Σ(各支付方式) 一致
#   d) 9 月营收 ≠ 0（确认旧数据迁移过）
```

---

## 5. 已发现 & 已修复（审计 agent 三路，2026-10-27）

| 严重度 | 问题 | 修复 commit | 状态 |
|--------|------|-------------|------|
| P0 | reopen 后 Payment 凭证停 SUCCESSFUL，新加钱收不到 | 本次 | ✅ 已修 |
| P0 | 报表 KPI 仍读旧 Payment 表（定金单少计） | 本次 | ✅ 已修 |
| P1 | cancel 后 Payment 凭证仍 PENDING，可被 admin_confirm 扣库存 | 本次 | ✅ 已修 |
| P1 | restore 不恢复已作废流水，已收钱账上消失 | 本次 | ✅ 已修 |
| P1 | record-prepaid kind 在实收为负时误标 DEPOSIT | 本次 | ✅ 已修 |
| P1 | 旧通道（admin_confirm/Omise）成功不写 PaymentRecord | 待评估 | ⚠️ 记录 |
| P2 | 订单号 `count+1+attempt` 并发 >3 可全撞/跳号 | 记录 | ⏳ |
| P2 | `recalcOrderTotals` 丢弃 Weighing.pricePerKg 快照 | 记录 | ⏳ |

---

## 6. 新建订单失败提示（UX 规范）

- 弹窗内必须**持久显示**错误原因（不靠顶部 toast 闪没）；
- 服务端 400 的 `code`（FUTURE_DATE_REJECTED / ITEM_NOT_FOUND / INSUFFICIENT_STOCK）要映射成可读文案；
- `i18n`：`adminOrders.createFailed` + 各错误码对应 hint（zh/en/th 三语对齐）。

---

## 7. 探针脚本索引

- `scripts/probe-login.cjs` — 登录拿 admin cookie（读 `.workbuddy/secrets/`，不打印）
- `scripts/verify-ledger.cjs` — 数据级回归（a~d 四项）
- `scripts/scan-impact.sh` — 影响面扫描（财务模块改动的关联文件清单）

> 若脚本缺失，按 §2/§4 的命令临时补一份，跑完删除（不留脏脚本）。
