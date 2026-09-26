#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hook Fishpond · 安装 / 更换推送凭据
#
# 一次把凭据装进「第 ② 级」和「第 ③ 级」两个位置：
#   ② Windows 凭据管理器（由 Windows 用 DPAPI 加密保管，git 自己取用）
#   ③ .workbuddy/secrets/github.local.env（明文，已 gitignore）
#
# 用 stdin 收口令 —— 这样它不会出现在命令行、不会进 shell 历史、不会被
# 进程列表看到。脚本自己不打印口令，只打印「装到哪了 + 校验结果」。
#
# 用法（三种任选）：
#   # 1) 从剪贴板/文件喂进来（推荐）
#   cat token.txt | bash scripts/setup-push-credential.sh
#
#   # 2) 从已有的本地凭据文件重新装一遍（比如凭据管理器被清空了）
#   bash scripts/setup-push-credential.sh --from-file
#
#   # 3) 交互式输入（Git Bash 里 bash 内置 read，不回显）
#   bash scripts/setup-push-credential.sh --prompt
#
# 换 token 之后要重跑本脚本，然后去 GitHub 把旧的撤销掉。
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail

OWNER="${PUSH_OWNER:-cdh428}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET_FILE="$ROOT/.workbuddy/secrets/github.local.env"
TOKEN=""
MODE="stdin"

while [ $# -gt 0 ]; do
  case "$1" in
    --from-file) MODE="file"; shift ;;
    --prompt)    MODE="prompt"; shift ;;
    -h|--help)   sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

# ── 取口令 ───────────────────────────────────────────────────────────
case "$MODE" in
  stdin)
    TOKEN="$(cat | tr -d ' \t\r\n')"
    ;;
  file)
    [ -f "$SECRET_FILE" ] || { echo "✗ 没有 $SECRET_FILE，改用 stdin 方式喂一个新 token" >&2; exit 1; }
    TOKEN="$(grep -m1 '^GITHUB_TOKEN=' "$SECRET_FILE" | cut -d= -f2- | tr -d ' \t\r\n')"
    ;;
  prompt)
    printf '把 GitHub token 粘进来（不回显，粘贴后回车）：'
    read -rs TOKEN </dev/tty
    printf '\n'
    TOKEN="$(printf '%s' "$TOKEN" | tr -d ' \t\r\n')"
    ;;
esac

if [ -z "$TOKEN" ]; then echo "✗ 没拿到 token（空输入）" >&2; exit 1; fi

LEN=${#TOKEN}
case "$TOKEN" in
  ghp_*) KIND="classic PAT" ;;
  github_pat_*) KIND="fine-grained PAT" ;;
  *) KIND="非 PAT 形态（不确定是什么，继续）" ;;
esac
echo "拿到 token：长度 $LEN，形态 $KIND"
if [ "$LEN" -lt 20 ]; then echo "⚠️ 长度可疑，先确认没粘错" >&2; fi

# ── 定位 git-credential-wincred ──────────────────────────────────────
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
WC="$(find_wincred || true)"

# ── ③ 写本地凭据文件 ─────────────────────────────────────────────────
mkdir -p "$(dirname "$SECRET_FILE")"
STAMP="$(date -Iseconds)"
cat > "$SECRET_FILE" <<HDR
# ═══════════════════════════════════════════════════════════════
# Hook Fishpond · GitHub 推送凭据（明文，兜底 = 备选链第 3 级）
#
# ⚠️ 明文。整个 .workbuddy/ 都在 .gitignore 里，永不进仓库。
# 更新于 $STAMP，形态：$KIND
#
# 更强的两级见 scripts/push-main.sh：
#   ① SSH Deploy Key（无口令）  ② Windows 凭据管理器（DPAPI 加密）
# ═══════════════════════════════════════════════════════════════
GITHUB_USER=$OWNER
HDR
printf 'GITHUB_TOKEN=%s\n' "$TOKEN" >> "$SECRET_FILE"
echo "③ 本地凭据文件  → $SECRET_FILE  （已更新）"

# ── ② 写 Windows 凭据管理器 ──────────────────────────────────────────
if [ -n "$WC" ]; then
  printf 'protocol=https\nhost=github.com\nusername=%s\npassword=%s\n\n' "$OWNER" "$TOKEN" \
    | "$WC" store 2>/dev/null
  BACK="$(printf 'protocol=https\nhost=github.com\n\n' | "$WC" get 2>/dev/null)"
  OK_U="$(printf '%s' "$BACK" | grep -c '^username=')"
  OK_P="$(printf '%s' "$BACK" | grep -c '^password=')"
  if [ "$OK_U" = "1" ] && [ "$OK_P" = "1" ]; then
    echo "② Windows 凭据管理器 → github.com （写入并读回校验通过）"
  else
    echo "② Windows 凭据管理器 → ✗ 写进去了但读不回来，检查 helper 路径：$WC"
  fi
else
  echo "② Windows 凭据管理器 → ⚠️ 本机没找到 git-credential-wincred，跳过（只剩 ①③ 两级）"
fi

# ── 验证 ─────────────────────────────────────────────────────────────
echo ""
echo "验证（dry-run 推一次，不真推）："
bash "$ROOT/scripts/push-main.sh" --dry-run 2>&1 | tail -4
echo ""
echo "别忘了：去 GitHub 把不再使用的旧 token 撤销掉"
echo "  https://github.com/settings/tokens"

unset TOKEN
