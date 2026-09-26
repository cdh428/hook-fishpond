#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hook Fishpond · 提交前密文扫描（防泄漏闸门）
#
# 由 .git/hooks/pre-commit 调用（安装：bash scripts/install-git-hooks.sh）
# 也可以随时手动跑：bash scripts/check-secrets.sh
#
# 只扫**暂存区里新增的行**（git diff --cached -U0），所以：
#   - 历史里已有的东西不会一直报警
#   - 未暂存的改动不会被误报
#
# ⚠️ 正则都要求「真实长度」，不是只匹配前缀 —— 否则文档里写一句
#    "命中 ghp_ 就拒绝" 会把自己拦下来（这个坑踩过）。
#
# 逃生通道（确实需要提交示例值时）：
#   ALLOW_SECRETS=1 git commit ...
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail

if [ "${ALLOW_SECRETS:-}" = "1" ]; then
  echo "⚠️ ALLOW_SECRETS=1 —— 跳过密文扫描（请确认你知道自己在提交什么）"
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "不在 git 仓库里"; exit 0; }
cd "$ROOT"

# ── 规则表：名称|正则 ────────────────────────────────────────────────
RULES=$(cat <<'EOF'
GitHub classic PAT|ghp_[A-Za-z0-9]{30,}
GitHub fine-grained PAT|github_pat_[A-Za-z0-9_]{50,}
GitHub OAuth token|gho_[A-Za-z0-9]{30,}
GitHub app token|ghs_[A-Za-z0-9]{30,}
OpenAI key|sk-[A-Za-z0-9]{32,}
Anthropic key|sk-ant-[A-Za-z0-9_-]{30,}
AWS access key id|AKIA[0-9A-Z]{16}
Slack token|xox[abpsr]-[A-Za-z0-9-]{20,}
带密码的库连接串|(postgres|postgresql|mysql)://[^:@/[:space:]]+:[^@/[:space:]]{6,}@
私钥头|-----BEGIN [A-Z ]*PRIVATE KEY-----
OpenSSH 私钥|-----BEGIN OPENSSH PRIVATE KEY-----
写死的管理员口令|ADMIN_PASSWORD=[A-Za-z0-9!@#$%^&*_-]{8,}
写死的 LINE token|LINE_CHANNEL_ACCESS_TOKEN=[A-Za-z0-9+/=]{40,}
EOF
)

# ── 取暂存区新增行（文件名 + 行号 + 内容，用 \x01 分隔，避免路径含冒号）──
#
# ⚠️ 必须排除本文件自己：下面的「规则表」里就写着这些模式文本，
#    不排除的话扫描器会把自己拦下来（这个坑踩过一次）。
DIFF="$(git diff --cached -U0 --no-color -- . ':(exclude)scripts/check-secrets.sh' 2>/dev/null \
  | grep -a '^+' | grep -av '^+++ ' || true)"

if [ -z "$DIFF" ]; then
  echo "✅ 密文扫描：暂存区没有新增行，跳过"
  exit 0
fi

HITS=0
while IFS='|' read -r NAME RE; do
  [ -z "$NAME" ] && continue
  if MATCHED=$(printf '%s\n' "$DIFF" | grep -aEo ".{0,40}$RE.{0,10}" | head -5) && [ -n "$MATCHED" ]; then
    if [ "$HITS" = "0" ]; then
      echo ""
      echo "🚫 提交被拦下：暂存区里疑似有凭据"
      echo "──────────────────────────────────────────────"
    fi
    HITS=$((HITS + 1))
    echo "  ✗ $NAME"
    # 命中片段也要脱敏，别把凭据本身打到终端上
    printf '%s\n' "$MATCHED" | sed -E 's/[A-Za-z0-9_+\/=-]{12,}/***/g' | sed 's/^/      /'
    echo ""
  fi
done <<< "$RULES"

# ── 额外检查：私钥类文件被加进暂存区 ──────────────────────────────────
KEYFILES="$(git diff --cached --name-only --diff-filter=A 2>/dev/null \
  | grep -aE '(^|/)(id_(rsa|ed25519|ecdsa|dsa)|[^/]*_deploy|[^/]*\.pem|[^/]*\.key)$' || true)"
if [ -n "$KEYFILES" ]; then
  if [ "$HITS" = "0" ]; then echo ""; echo "🚫 提交被拦下：暂存区里疑似有凭据"; echo "──────────────────────────────────────────────"; fi
  HITS=$((HITS + 1))
  echo "  ✗ 新增了私钥类文件："
  printf '%s\n' "$KEYFILES" | sed 's/^/      /'
  echo ""
fi

if [ "$HITS" -gt 0 ]; then
  echo "──────────────────────────────────────────────"
  echo "怎么处理："
  echo "  1. 如果确实是凭据 → 从暂存区拿掉：git restore --staged <文件>"
  echo "     并把值挪到 .workbuddy/secrets/（已在 .gitignore 里）"
  echo "  2. 如果只是文档里的示例 → 打成占位符（如 ghp_xxxx…）再提交"
  echo "  3. 确认无风险要硬提交 → ALLOW_SECRETS=1 git commit ..."
  echo ""
  exit 1
fi

echo "✅ 密文扫描通过（暂存区新增行里没有发现凭据）"
exit 0
