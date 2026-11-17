#!/usr/bin/env node
/**
 * 快速密文体检（纯 Node，不把全文灌进 shell 变量）
 *
 * 为什么有它：`bash scripts/check-secrets.sh --all` 会把每个被跟踪文件 cat 进
 * shell 变量再 grep，本机在 1.7 万文件的仓库里会跑很久甚至超时（本机已验证）。
 * 这个脚本只读已跟踪文件、逐个用正则扫，几秒出结果，用于**体检**；
 * pre-commit 用的仍然是 check-secrets.sh（只看暂存区，很快）。
 *
 * 用法：
 *   node scripts/scan-secrets-fast.mjs           # 扫已跟踪文件
 *   node scripts/scan-secrets-fast.mjs --workbuddy  # 额外扫 .workbuddy/（被 gitignore 的雷区）
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RULES = [
  ['Neon/PG 连接串(真口令)', /postgres(ql)?:\/\/[A-Za-z0-9_.-]+:(?!<|\$|\{)[^@\s"']{8,}@/g],
  ['GitHub token', /(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/g],
  ['Google API Key', /AIza[0-9A-Za-z_-]{30,}/g],
  ['OpenAI-like sk-', /(^|[^A-Za-z0-9])sk-[A-Za-z0-9]{32,}/g],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{30,}/g],
  ['Omise secret', /skey_(live|test)_[A-Za-z0-9]{16,}/g],
  ['Slack token', /xox[abpsr]-[A-Za-z0-9-]{20,}/g],
  ['AWS key id', /AKIA[0-9A-Z]{16}/g],
  ['JWT/长 b64', /eyJhbGciOi[A-Za-z0-9_-]{20,}/g],
  ['私钥块', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
];

const SKIP_DIR = /^(fishpond-flood-ad|fishpond-end-card|node_modules|\.next|\.git)\//;
/**
 * 扫描器自身例外：这两个文件里写着「凭据的正则模式」，
 * 例如私钥头那行是规则文本，不是真私钥。
 * 排除它们，否则每次体检都误报（原 check-secrets.sh 也是用 :(exclude) 同样处理）。
 */
const SELF_EXCLUDE = new Set(['scripts/check-secrets.sh', 'scripts/scan-secrets-fast.mjs']);
const isPlaceholder = (v) =>
  /<|USER|PASSWORD|PASS>|HOST>|user>:<pass|xxxx|your-|example/i.test(v) ||
  /^iVBOR|\/9j\//.test(v);

function scanText(label, text, out) {
  for (const [name, re] of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const v = m[0];
      if (isPlaceholder(v)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      out.push(`  [${name}] ${label}:${line}  ${v.slice(0, 26).replace(/[A-Za-z0-9+/=]{8,}$/, '…')}`);
    }
  }
}

const hits = [];
let scanned = 0;
let skipped = 0;
const files = execSync('git ls-files', { maxBuffer: 64 * 1024 * 1024 })
  .toString()
  .split('\n')
  .filter(Boolean);

for (const f of files) {
  if (SKIP_DIR.test(f)) { skipped++; continue; }
  if (SELF_EXCLUDE.has(f)) { skipped++; continue; }
  let st;
  try { st = fs.statSync(f); } catch { continue; }
  if (!st.isFile() || st.size > 3_000_000) { skipped++; continue; }
  let s;
  try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (s.includes('\u0000')) { skipped++; continue; }
  scanned++;
  scanText(f, s, hits);
}

if (process.argv.includes('--workbuddy')) {
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(tmp|_tmp|shots|backups)$/.test(e.name)) walk(p); continue; }
      if (!/\.(md|txt|env|json|ya?ml|ts|tsx|js|mjs|cjs|py|sh|bat|vbs|html)$/.test(e.name)) continue;
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.size > 3_000_000) continue;
      let s;
      try { s = fs.readFileSync(p, 'utf8'); } catch { continue; }
      if (s.includes('\u0000')) continue;
      scanned++;
      scanText(p, s, hits);
    }
  };
  walk('.workbuddy');
}

if (hits.length) {
  console.log('🚫 发现疑似凭据：\n');
  console.log(hits.join('\n'));
  console.log(`\n共 ${hits.length} 处。处置顺序：先轮换 → 再替换文本 → 重扫 → 才算完。`);
  process.exit(1);
}
console.log(`✅ 密文体检通过（扫描 ${scanned} 个文件，跳过 ${skipped} 个构建/封存目录）`);
