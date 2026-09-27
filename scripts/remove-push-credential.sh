#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hook Fishpond · 清除本机留存的所有推送凭据
#
# 用在「已经决定只靠 ① SSH Deploy Key」的时候 —— 清完之后本机**不再存任何
# 可复制的口令**，推送改由仓库级密钥完成。
#
# 清掉两处（对应 scripts/push-main.sh 的第 ②③ 级）：
#   - Windows 凭据管理器里的 github.com 条目
#   - .workbuddy/secrets/github.local.env（明文文件）
#
# ⚠️ 清完第 ②③ 级就失效了，只剩 ① SSH。跑之前先确认 ① 是通的：
#      bash scripts/push-main.sh --level 1 --dry-run
#
# ⚠️ 本脚本**不能**帮你撤销 GitHub 上的 token —— 那只能在网页上做：
#      https://github.com/settings/tokens
#    请在跑完本脚本后，顺手去把旧 token 撤销掉，否则它在 GitHub 那侧依然有效。
#
# 用法：
#   bash scripts/remove-push-credential.sh              # 会先体检再问一次
#   bash scripts/remove-push-credential.sh --yes        # 不问，直接清
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET_FILE="$ROOT/.workbuddy/secrets/github.local.env"
ASSUME_YES=""
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

find_wincred() {
  if command -v git-credential-wincred >/dev/null 2>&1; then command -v git-credential-wincred; return 0; fi
  local roots d cand
  roots=""
  [ -n "${LOCALAPPDATA:-}" ] && roots="$roots $(ls -d "$LOCALAPPDATA"/GitHubDesktop/app-*/resources/app/git 2>/dev/null)"
  [ -n "${HOME:-}" ] && roots="$roots $(ls -d "$HOME"/.workbuddy/binaries/PortableGit/versions/* 2>/dev/null)"
  for cand in $(echo "$roots" | tr ' ' '\n' | grep -v '^$' | sort -V -r); do
    for d in "$cand/mingw64/libexec/git-core" "$cand/mingw64/bin"; do
      if [ -x "$d/git-credential-wincred.exe" ]; then echo "$d/git-credential-wincred.exe"; return 0; fi
    done
  done
  return 1
}

echo "═══ 清除前体检 ═══"
echo "① SSH 通道："
bash "$ROOT/scripts/push-main.sh" --level 1 --dry-run 2>&1 | tail -3
echo ""

if [ -z "$ASSUME_YES" ]; then
  printf '确认清除本机留存的推送凭据？(yes/N) '
  read -r ans
  [ "$ans" = "yes" ] || { echo "已取消，什么都没动"; exit 0; }
fi

# ── ② 凭据管理器 ─────────────────────────────────────────────────────
WC="$(find_wincred || true)"
if [ -n "$WC" ]; then
  printf 'protocol=https\nhost=github.com\n\n' | "$WC" erase 2>/dev/null
  LEFT=$(printf 'protocol=https\nhost=github.com\n\n' | "$WC" get 2>/dev/null | grep -c '^password=')
  [ "$LEFT" = "0" ] && echo "② 凭据管理器 github.com 条目 → 已清除" || echo "② ⚠️ 好像还在，请到「凭据管理器 → Windows 凭据」手工删 git:https://github.com"
else
  echo "② 本机没找到 git-credential-wincred，跳过"
fi

# ── ③ 明文文件 ───────────────────────────────────────────────────────
if [ -f "$SECRET_FILE" ]; then
  # 用 node 覆写再删，避免明文残留在磁盘块里（node 能做纯文件操作，不需要起子进程）
  NODE_BIN="${NODE_BIN:-node}"
  if command -v "$NODE_BIN" >/dev/null 2>&1; then
    "$NODE_BIN" -e "const fs=require('fs');const p=process.argv[1];const n=fs.statSync(p).size;fs.writeFileSync(p,'0'.repeat(n));fs.unlinkSync(p);" "$SECRET_FILE" 2>/dev/null \
      && echo "③ 本地凭据文件 → 已覆写并删除" \
      || echo "③ 本地凭据文件 → 删除失败，请手工删 $SECRET_FILE"
  else
    rm -f "$SECRET_FILE" && echo "③ 本地凭据文件 → 已删除"
  fi
else
  echo "③ 本地凭据文件本来就不存在"
fi

# ── 复验：只剩 ① ─────────────────────────────────────────────────────
echo ""
echo "═══ 清除后复验（应显示第 ① 级成功、②③ 不可用）═══"
bash "$ROOT/scripts/push-main.sh" --dry-run --verbose 2>&1 | tail -12

echo ""
echo "❗还差最后一步（只能你自己做）：去撤销 GitHub 上的旧 token"
echo "   https://github.com/settings/tokens"
echo "   撤销前，那把 token 在 GitHub 那侧依然有效 —— 本脚本只管本机。"
