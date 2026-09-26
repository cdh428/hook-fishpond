#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hook Fishpond · 安装 git 钩子
#
# .git/hooks/ 不在版本控制里（每人本地一份），所以把钩子内容放进
# 版本控制的 scripts/check-secrets.sh，这里只负责把入口装上。
#
# 克隆仓库后跑一次即可：
#   bash scripts/install-git-hooks.sh
#
# 装了什么：
#   pre-commit → 调 scripts/check-secrets.sh，扫暂存区新增行里的凭据
#
# 卸载：rm .git/hooks/pre-commit
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "✗ 不在 git 仓库里" >&2; exit 1; }
HOOK="$ROOT/.git/hooks/pre-commit"

mkdir -p "$ROOT/.git/hooks"

if [ -f "$HOOK" ]; then
  if grep -q 'check-secrets.sh' "$HOOK" 2>/dev/null; then
    echo "✅ pre-commit 钩子已经装过了，无需重复"
    exit 0
  fi
  BACKUP="$HOOK.bak.$(date +%s)"
  cp "$HOOK" "$BACKUP"
  echo "⚠️ 已存在别的 pre-commit，先备份到：$BACKUP"
fi

cat > "$HOOK" <<'HOOKEOF'
#!/usr/bin/env bash
# 由 scripts/install-git-hooks.sh 安装 —— 逻辑都在 scripts/check-secrets.sh
ROOT="$(git rev-parse --show-toplevel)"
exec bash "$ROOT/scripts/check-secrets.sh"
HOOKEOF

chmod +x "$HOOK"
echo "✅ 已安装 pre-commit 钩子 → $HOOK"
echo ""
echo "自检（在暂存区扫描一次）："
bash "$ROOT/scripts/check-secrets.sh"
