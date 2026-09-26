#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hook Fishpond · 分层推送
#
# 按「一级更比一级不依赖外部状态」的顺序依次尝试，第一级成功就停：
#
#   ① SSH Deploy Key          仓库级钥匙，只对本仓库有效，**不含任何可复制的口令**
#   ② Windows 凭据管理器      凭据由 Windows 保管（DPAPI 加密），git 自己取用，
#                             脚本与调用方都看不到明文
#   ③ 本地凭据文件            明文，落在 .workbuddy/secrets/（已 gitignore）。
#                             换机器、换 Windows 账户、凭据管理器清空时的最后兜底
#
# 三级都用不上时，脚本会明确报错告诉你需要做什么，而不是默默失败。
#
# 用法：
#   bash scripts/push-main.sh                    # 自动按 ①②③ 依次试
#   bash scripts/push-main.sh --level 2          # 只用第 ② 级
#   bash scripts/push-main.sh --dry-run          # 只验证凭据通不通，不真推
#   bash scripts/push-main.sh --branch dev       # 推别的分支（默认 main）
#   bash scripts/push-main.sh --verbose          # 打印各级失败原因
#
# ⚠️ 输出一律经过脱敏（把长 token 串替换成 ***），避免日志里出现凭据。
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail

OWNER="${PUSH_OWNER:-cdh428}"
REPO="${PUSH_REPO:-hook-fishpond}"
BRANCH="main"
LEVELS="1 2 3"
DRY=""
VERBOSE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --level)   LEVELS="$2"; shift 2 ;;
    --branch)  BRANCH="$2"; shift 2 ;;
    --dry-run) DRY="--dry-run"; shift ;;
    --verbose|-v) VERBOSE=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "未知参数: $1（用 --help 看用法）" >&2; exit 2 ;;
  esac
done

# ── 脱敏：任何 20 位以上的字母数字串都当成可能的凭据抹掉 ──────────────
sanitize() { sed -E 's/[A-Za-z0-9_]{20,}/***/g'; }

# ── 定位 git ─────────────────────────────────────────────────────────
GIT_BIN="${GIT_BIN:-git}"
command -v "$GIT_BIN" >/dev/null 2>&1 || { echo "✗ 找不到 git（可设 GIT_BIN 指定绝对路径）" >&2; exit 1; }

# ── 定位 git-credential-wincred（不写死 GitHub Desktop 的版本号目录）──
find_wincred() {
  if command -v git-credential-wincred >/dev/null 2>&1; then
    command -v git-credential-wincred; return 0
  fi
  local cand roots d
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

SECRET_FILE="$(cd "$(dirname "$0")/.." && pwd)/.workbuddy/secrets/github.local.env"

note() { [ -n "$VERBOSE" ] && echo "      $*"; return 0; }

# ── 第 ① 级：SSH Deploy Key ──────────────────────────────────────────
level1() {
  echo "① SSH Deploy Key"
  local url; url=$("$GIT_BIN" remote get-url origin 2>/dev/null || echo "")
  note "origin = ${url:-(未配置)}"
  # ⚠️ 别拿 'github.com' 去匹配：SSH 别名（如 git@github-hookfishpond:...）不含它，
  #    会被误判成「不是 GitHub」而白白跳过硬碰碰能成功的一级。只挡空值即可。
  if [ -z "$url" ]; then note "origin 未配置，跳过"; return 1; fi
  local out
  if out=$("$GIT_BIN" push $DRY origin "$BRANCH" 2>&1); then
    echo "$out" | sanitize | tail -3
    echo "   ✅ 成功（无需任何口令）"
    return 0
  fi
  note "$(echo "$out" | sanitize | tail -2)"
  echo "   ✗ 失败 —— 检查 ~/.ssh/config 里有没有 github-hookfishpond 段，或仓库 Deploy keys 是否还在"
  return 1
}

# ── 第 ② 级：Windows 凭据管理器 ──────────────────────────────────────
level2() {
  echo "② Windows 凭据管理器（git-credential-wincred）"
  local wc; wc=$(find_wincred) || { note "本机没找到 git-credential-wincred"; echo "   ✗ 不可用"; return 1; }
  note "helper = $wc"
  local out
  if out=$("$GIT_BIN" -c credential.helper="$wc" push $DRY \
            "https://github.com/$OWNER/$REPO.git" "$BRANCH" 2>&1); then
    echo "$out" | sanitize | tail -3
    echo "   ✅ 成功（凭据由 Windows 保管，未经过本脚本）"
    return 0
  fi
  note "$(echo "$out" | sanitize | tail -2)"
  echo "   ✗ 失败 —— 凭据可能没装或已失效，跑一次："
  echo "      bash scripts/setup-push-credential.sh"
  return 1
}

# ── 第 ③ 级：本地凭据文件（明文，本机）───────────────────────────────
level3() {
  echo "③ 本地凭据文件（明文兜底）"
  [ -f "$SECRET_FILE" ] || { note "缺 $SECRET_FILE"; echo "   ✗ 不可用"; return 1; }
  local user tok
  user=$(grep -m1 '^GITHUB_USER='  "$SECRET_FILE" | cut -d= -f2-)
  tok=$(grep  -m1 '^GITHUB_TOKEN=' "$SECRET_FILE" | cut -d= -f2-)
  if [ -z "$user" ] || [ -z "$tok" ]; then note "文件里缺 GITHUB_USER 或 GITHUB_TOKEN"; echo "   ✗ 不可用"; return 1; fi
  note "沿用 $user，凭据来自本地文件"
  local out
  if out=$("$GIT_BIN" push $DRY "https://$user:$tok@github.com/$OWNER/$REPO.git" "$BRANCH" 2>&1); then
    # 注意：这一级把 token 写进了命令行，只在本机、只做一次；输出照样脱敏
    echo "$out" | sanitize | tail -3
    echo "   ✅ 成功（用的是明文凭据 —— 说明前两级都不通了，值得查一下）"
    return 0
  fi
  note "$(echo "$out" | sanitize | tail -2)"
  echo "   ✗ 失败 —— token 可能已被撤销："
  echo "      bash scripts/setup-push-credential.sh   # 重新装一份"
  return 1
}

# ── 主流程 ───────────────────────────────────────────────────────────
echo "推送 $OWNER/$REPO → $BRANCH ${DRY:+（dry-run）}"
echo "───────────────────────────────────────────────"
for L in $LEVELS; do
  case "$L" in
    1) level1 && { echo "───────────────────────────────────────────────"; echo "结果：✅ 第 ① 级成功"; exit 0; } ;;
    2) level2 && { echo "───────────────────────────────────────────────"; echo "结果：✅ 第 ② 级成功"; exit 0; } ;;
    3) level3 && { echo "───────────────────────────────────────────────"; echo "结果：✅ 第 ③ 级成功"; exit 0; } ;;
    *) echo "未知级别: $L" >&2; exit 2 ;;
  esac
  echo ""
done
echo "───────────────────────────────────────────────"
echo "结果：❌ 三级全部失败"
echo ""
echo "排查顺序："
echo "  1. 网络能不能到 github.com（本机可能设了代理）"
echo "  2. 仓库 Deploy keys 里 hook-fishpond-ai-push 是否还在"
echo "  3. Windows 凭据管理器里有没有 git:https://github.com"
echo "  4. 本地凭据文件的 token 是不是已被撤销"
exit 1
