# AGENT-TEAM.md — AI 运营团队名册（乐钓鱼塘 / hookfishpond.com）

> 这是「谁在帮这个网站值班」的唯一权威名册，**随仓库走**（换机器、交接都在）。
> WorkBuddy 侧已有对应的专家团包 `hook-fishpond-ops`（专家中心可见）；
> 本文件是知识权威版，两边改任何一边都要同步。
> 更新日期：2026-09-28

---

## 一、团队构成

| Agent ID | 名字 | 职业 | 负责什么 | 什么时候召唤 |
|---|---|---|---|---|
| hook-fishpond-ops-team-lead | 池恒安 | 塘口运营总监 | 分派任务、汇编结论、对外回报；不代写成员产出 | 综合性请求、多环节协作 |
| pond-reliability | 常巡洋 | 运维值守工程师 | 推送链路、Vercel 部署（只看 `hook-fishpond-xi15`）、备份 workflow、数据库探针、安全基线走查 | 「巡检 / 今天状态怎么样 / 推送部署备份」 |
| social-growth | 潘声远 | 社媒增长运营 | FB 主页 / IG / LINE 内容策划与发布命令、令牌生命周期、平台限制 | 「发帖 / 社媒排期 / 令牌」 |
| trilingual-editor | 佟译佳 | 三语内容编辑 | 中英泰文案（页面 / 菜单 / 社媒）、i18n 键纪律、三语语义一致性 | 「翻译 / 改文案 / 改菜单名」 |

## 二、三条标准 SOP

| Workflow | 触发 | 流程 |
|---|---|---|
| A 全站巡检 | 巡检 / 体检 / 出事前自查 | reliability 全链路实测（推送 dry-run → 三语 200 → Actions 备份 → DB 探针 → 安全待办）→ 主理人汇总红绿灯表 |
| B 内容上线 | 改菜单 / 价格 / 页面文案 | editor 出三语文案包 → reliability 跑推送前清单并推送 → 主理人回报改动面与验证 |
| C 社媒发帖 | 发 FB/IG/LINE | growth 出选题+图+命令 → editor 三语润色与事实核对 → **用户确认后**才真正发布 |

## 三、配套技能与手册索引

| 本项目技能（`.workbuddy/skills/`，只是入口） | 权威正文（随仓库） |
|---|---|
| fishpond-push-checklist | `docs/playbooks/push-checklist.md` |
| fishpond-security-audit | `docs/playbooks/security-audit.md` |
| fishpond-media-pipeline | `docs/playbooks/media-pipeline.md` |
| fishpond-social-publishing | `docs/playbooks/social-publishing.md` |
| fishpond-ops-team | 本文件 |

常用值守命令：`node scripts/db-conn-check.cjs`（数据库探针）·
`node scripts/check-i18n.mjs`（三语核验）· `bash scripts/push-main.sh --dry-run --verbose`（推送凭据）。

## 四、建议节奏

- **每天**：LINE 经营日报 21:00 自动推送（已有，不用盯）。
- **每周**：叫团队跑一次 Workflow A 全站巡检 —— 备份 workflow 红了能立刻看到
  （教训：冷备静默失败 11 天没人发现）。
- **每月**：过一遍 `docs/CREDENTIALS.md` §5 安全待办。
- **每 50 天**（社媒定时方案 A 落地前）：人工检查 Meta 主页令牌是否需续期（60 天寿命）。

## 五、新机复制 / 交接清单

1. `git clone git@github-hookfishpond:cdh428/hook-fishpond.git`；Node 22 / Python 3.13。
2. `npm ci` —— ⚠️ 本机 WorkBuddy 沙箱里 node 不能起子进程（EBUSY），postinstall 可能失败；
   失败就复用另一份装好依赖的检出：`NODE_PATH=<that-repo>/node_modules node scripts/...`。
3. `.env.local` 按根目录 `.env.example` 找店主取值填（**值永不进仓库/聊天**）。
4. **SSH Deploy Key（每机一把）**：新机 `ssh-keygen -t ed25519`，GitHub 网页 →
   仓库 Settings → Deploy keys → Add（**勾选 Allow write access**）；
   `~/.ssh/config` 加别名 `github-hookfishpond` 指向新私钥。详见 `docs/CREDENTIALS.md` §4。
5. `bash scripts/install-git-hooks.sh`（pre-commit 密文闸门）。
6. **验证四连**（全绿才算接好）：
   `node scripts/db-conn-check.cjs` / `bash scripts/push-main.sh --dry-run --verbose` /
   `curl -s -o /dev/null -w "%{http_code}" https://hookfishpond.com/zh`（期望 200）/ `node scripts/check-i18n.mjs`。
7. （现场收银机）打印桥 `tools/print-bridge/` + 蓝牙串口 → 见跨项目 skill `windows-thermal-printer-bridge`。
8. **WorkBuddy 侧**：专家中心导入 `hook-fishpond-ops.zip`
   （或整目录拷贝 `~/.workbuddy/plugins/marketplaces/my-experts/`），
   再把 `.workbuddy/skills/` 下 5 个 fishpond-* 入口技能在本机重建。

## 六、修改规则

- 改团队构成 / SOP：**本文件与专家包两处同步**（专家包在
  `~/.workbuddy/plugins/marketplaces/my-experts/plugins/hook-fishpond-ops`，不入 git）。
- 专家包丢失：用 `hook-fishpond-ops.zip` 重新导入，或按本文件 §一/§二 手工重建。
