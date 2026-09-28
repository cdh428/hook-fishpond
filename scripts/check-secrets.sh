#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hook Fishpond · 密文扫描（防泄漏闸门）
#
# 三种用法：
#   bash scripts/check-secrets.sh                 # 扫暂存区（pre-commit 用）
#   bash scripts/check-secrets.sh --range A..B    # 扫一段提交范围（CI 用）
#   bash scripts/check-secrets.sh --all           # 扫全部已跟踪文件（体检用）
#
# 只扫**新增的行**，所以历史里已有的东西不会一直报警。
#
# ⚠️ 两条设计约束（都踩过坑）：
#    1. 正则要求「看起来像真实凭据」，不是只匹配前缀 —— 否则文档里写一句
#       "命中 ghp_ 就拒绝" 会把自己拦下来。
#    2. 连接串那条额外排除了 `<PASSWORD>` 这类**占位符**（要求口令里含数字、
#       且不含尖括号），否则每次改 .env.example 都会被误拦。
#
# 逃生通道（确实需要提交示例值时）：
#   ALLOW_SECRETS=1 git commit ...
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail

if [ "${ALLOW_SECRETS:-}" = "1" ]; then
  echo "⚠️ ALLOW_SECRETS=1 —— 跳过密文扫描（请确认你知道自己在提交什么）"
  exit 0
fi

MODE="staged"
RANGE=""
case "${1:-}" in
  "") ;;
  --range)
    MODE="range"
    RANGE="${2:-}"
    if [ -z "$RANGE" ]; then
      echo "用法：bash scripts/check-secrets.sh --range <base>..<head>" >&2
      exit 2
    fi
    ;;
  --all)
    MODE="all"
    ;;
  -h|--help)
    sed -n '2,19p' "$0"
    exit 0
    ;;
  *)
    echo "未知参数：$1（支持 --range <A..B> / --all，留空则扫暂存区）" >&2
    exit 2
    ;;
esac

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
JWT / Supabase key|eyJhbGciOi[A-Za-z0-9_-]{20,}
带密码的库连接串|(postgres|postgresql|mysql)://[^:@/[:space:]<>]+:[^@/[:space:]<>]{5,}[0-9][^@/[:space:]<>]*@
私钥头|-----BEGIN [A-Z ]*PRIVATE KEY-----
OpenSSH 私钥|-----BEGIN OPENSSH PRIVATE KEY-----
写死的管理员口令|ADMIN_PASSWORD=[A-Za-z0-9!@#$%^&*_-]{8,}
写死的 LINE token|LINE_CHANNEL_ACCESS_TOKEN=[A-Za-z0-9+/=]{40,}
EOF
)

# ── 取要扫描的文本 ───────────────────────────────────────────────────
#
# ⚠️ 必须排除本文件自己：上面的「规则表」里就写着这些模式文本，
#    不排除的话扫描器会把自己拦下来（这个坑踩过一次）。
case "$MODE" in
  staged)
    DIFF="$(git diff --cached -U0 --no-color -- . ':(exclude)scripts/check-secrets.sh' 2>/dev/null \
      | grep -a '^+' | grep -av '^+++ ' || true)"
    ADDED_FILES="$(git diff --cached --name-only --diff-filter=A 2>/dev/null || true)"
    SCOPE_DESC="暂存区新增行"
    ;;
  range)
    DIFF="$(git diff -U0 --no-color "$RANGE" -- . ':(exclude)scripts/check-secrets.sh' 2>/dev/null \
      | grep -a '^+' | grep -av '^+++ ' || true)"
    ADDED_FILES="$(git diff --name-only --diff-filter=A "$RANGE" 2>/dev/null || true)"
    SCOPE_DESC="提交范围 $RANGE 的新增行"
    ;;
  all)
    DIFF="$(while IFS= read -r f; do
      [ -f "$f" ] && cat -- "$f" 2>/dev/null
    done < <(git ls-files -- . ':(exclude)scripts/check-secrets.sh' 2>/dev/null) || true)"
    ADDED_FILES="$(git ls-files 2>/dev/null || true)"
    SCOPE_DESC="全部已跟踪文件"
    ;;
esac

if [ -z "$DIFF" ]; then
  echo "✅ 密文扫描：$SCOPE_DESC 为空，跳过"
  exit 0
fi

HITS=0
while IFS='|' read -r NAME RE; do
  [ -z "$NAME" ] && continue
  if MATCHED=$(printf '%s\n' "$DIFF" | grep -aEo ".{0,40}$RE.{0,10}" | head -5) && [ -n "$MATCHED" ]; then
    if [ "$HITS" = "0" ]; then
      echo ""
      echo "🚫 发现疑似凭据（扫描范围：$SCOPE_DESC）"
      echo "──────────────────────────────────────────────"
    fi
    HITS=$((HITS + 1))
    echo "  ✗ $NAME"
    # 命中片段也要脱敏，别把凭据本身打到终端/CI 日志上
    printf '%s\n' "$MATCHED" | sed -E 's/[A-Za-z0-9_+\/=-]{12,}/***/g' | sed 's/^/      /'
    echo ""
  fi
done <<< "$RULES"

# ── 额外检查：私钥类文件 ─────────────────────────────────────────────
KEYFILES="$(printf '%s\n' "$ADDED_FILES" 2>/dev/null \
  | grep -aE '(^|/)(id_(rsa|ed25519|ecdsa|dsa)|[^/]*_deploy|[^/]*\.pem|[^/]*\.key)$' || true)"
if [ -n "$KEYFILES" ]; then
  if [ "$HITS" = "0" ]; then
    echo ""
    echo "🚫 发现疑似凭据（扫描范围：$SCOPE_DESC）"
    echo "──────────────────────────────────────────────"
  fi
  HITS=$((HITS + 1))
  echo "  ✗ 出现私钥类文件："
  printf '%s\n' "$KEYFILES" | sed 's/^/      /'
  echo ""
fi

if [ "$HITS" -gt 0 ]; then
  echo "──────────────────────────────────────────────"
  echo "怎么处理："
  echo "  1. 如果确实是凭据 → 从提交里拿掉：git restore --staged <文件>"
  echo "     并把值挪到环境变量 / .workbuddy/secrets/（已在 .gitignore 里）"
  echo "  2. 如果只是文档里的示例 → 打成占位符（如 ghp_xxxx… 或 <PASSWORD>）再提交"
  echo "  3. 如果值是**已经泄漏过的** → 删掉文件不等于修复，必须**轮换**该凭据"
  echo "  4. 确认无风险要硬提交 → ALLOW_SECRETS=1 git commit ..."
  echo ""
  exit 1
fi

echo "✅ 密文扫描通过（$SCOPE_DESC 里没有发现凭据）"
exit 0
