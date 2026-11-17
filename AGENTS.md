# AGENTS.md — 会话必读（所有 AI / 人）

> 进入本仓库的任何会话，**动手前先按下面顺序读**。这是硬性要求，不是建议。

## 1. 第一站：`docs/link.md`（连接 · 闸门 · 安全）

凡涉及以下任一动作，**必须**先读 [`docs/link.md`](docs/link.md)：

- 推送代码 / 部署 / 建 Actions Secret
- 改 Vercel 环境变量
- 连数据库（Neon）、跑备份
- 连另一台电脑（打印桥 / Tailscale）、调打印机
- 处理凭据、怀疑密钥泄露、要把内容搬到仓库外

`link.md` 是唯一索引页，它指向各主题的权威源，**不要凭记忆操作**。

## 2. 三条不可违反的铁律

1. **密钥只存本机**：`.workbuddy/secrets/`、`.env.local`（均 gitignore）。
   仓库是 **public** —— 写进任何进 git 文件的值 = 公开发布。
2. **值不进对话**：涉及口令/令牌时，对话里只露前 4 位 + `…`，绝不整段回显。
3. **删 ≠ 修复**：明文进过 git 历史就必须**先轮换**，再清理文本。

## 3. 提交前固定动作

```bash
git status --porcelain          # 本仓库常有并行会话改动，先看
git add <明确路径>               # 禁用 add -A / commit -a
git diff --cached --stat        # 逐个确认真是自己的
git commit -m "..."             # 不要 --no-verify（pre-commit 是密文闸门）
bash scripts/push-main.sh
```

看到**陌生改动**（别的会话的半成品）：不代为提交、不 revert、不 stash。

## 4. 改完必须过的闸门

| 闸门 | 命令 |
|---|---|
| 类型 | `npx tsc --noEmit` |
| 三语 | `npm run check:i18n`（改文案后加 `--live`） |
| 构建 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build` |
| 密文 | `bash scripts/check-secrets.sh --all` |

## 5. 再往下的上下文

| 需要什么 | 读哪里 |
|---|---|
| 项目是什么 / 边界 / 业务规则 | [`PROJECT.md`](PROJECT.md) |
| **连接 · 闸门 · 安全（索引）** | **[`docs/link.md`](docs/link.md)** |
| 凭据位置与待处理安全问题 | [`docs/CREDENTIALS.md`](docs/CREDENTIALS.md) |
| 密钥读法 / 消敏 / 外搬闸门 | [`docs/playbooks/secrets-handling.md`](docs/playbooks/secrets-handling.md) |
| 推送 / 部署 / 备份 | [`docs/playbooks/deploy-and-backup.md`](docs/playbooks/deploy-and-backup.md) |
| 改代码前（事务/库存/金额） | [`docs/CODE-CONTRACTS.md`](docs/CODE-CONTRACTS.md) |
| 踩过的坑 | [`docs/playbooks/gotchas.md`](docs/playbooks/gotchas.md) |
| 顾客认证 | [`docs/playbooks/customer-auth.md`](docs/playbooks/customer-auth.md) |
| 打印桥跨机部署 | [`tools/print-bridge/目标电脑使用说明.md`](tools/print-bridge/目标电脑使用说明.md) |
| 运营手册 | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
