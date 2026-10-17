# docs/archive — 归档文档

这里放的是**已被取代或实施完毕**的文档。保留是为了追溯「当时为什么这么决定」，
但**不要再按它们操作**——每份的当前权威替代见下表。

> 判断「哪份还权威」的唯一标准：看文件顶部有没有「历史文档 / 已实施」标记，
> 以及 README 文档索引里列的是哪一份。

| 文件 | 归档原因 | 当前权威 |
|---|---|---|
| `ORDER-FLOW-PROPOSAL.md` | 下单/称重/结算流程**已实施**（2026-09-20 Phase1+2），方案讨论稿使命完成 | `CODE-CONTRACTS.md`（现行代码契约）+ `OPERATIONS.md`（运营步骤） |
| `SETUP_GUIDE.md` | 自标「历史文档」——数据层早从 Supabase 换成 Neon+Prisma，前端已接真实 API | `CREDENTIALS.md`（凭据去哪找）+ `playbooks/deploy-and-backup.md`（部署备份） |
| `STOCK_ACCOUNTING_BENCHMARK.md` | 开源对标调研（2026-09-21），采纳决策已落入代码，研究本身不再需要 | `CODE-CONTRACTS.md` 库存三态章节（reserveStock→consumeReservation→releaseOrderStock） |
| `LINE-OA-MANAGEMENT.md` | LINE bot 已停用（2026-10 决策），改走第三方 SaaS 管社媒 | `playbooks/social-tokens-setup.md` + `social-publishing.md` + `social-content-calendar.md` |
| `otp-line-login-oa-plan.html` | LINE OTP 方案因 LINE 渠道停用已搁置 | 同上；顾客身份验证的真正修法见 `CODE-CONTRACTS.md`（OTP） |
| `CONNECT_GUIDE.md` | 早期连接指南，被上述取代 | `CREDENTIALS.md` |
| `DEV_SUMMARY.md` | 早期开发阶段总结 | `OPERATIONS.md` + `CODE-CONTRACTS.md` |

## 仍留在 `docs/` 根（未归档，是当前权威）

- `ARCHITECTURE_V2.md` — 两塘口/用户/预订的 V2 架构大纲（仍有效）
- `AGENT-TEAM.md` — AI 运营团队名册（随仓库走，换机/交接用）
- `CODE-CONTRACTS.md` — **改代码前必读**的四条契约
- `CREDENTIALS.md` — 凭据位置（不含值）
- `DESIGN_SYSTEM.md` — 设计系统（含响应式容器规则表）
- `OPERATIONS.md` — 运营手册（含部分付款 SOP）
- `playbooks/*` — 各流程权威版

> 注意：`docs/` 根还有几个**一次性 HTML 提案/参考页**
> （`local-growth-and-api-plan.html`、`pond-rules-and-rewards.html`、`media-preview.html`、
> `fish-take-home-rules.html`、`en-pond-intro.md`、`price-adjustment-3lang.md`）。
> 它们是被 `OPERATIONS.md`/`pond-rules` 页面对外的**内容来源**，暂不归档——
> 哪天确认完全被线上页面取代，再移进来。
