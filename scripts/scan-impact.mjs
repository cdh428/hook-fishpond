#!/usr/bin/env node
/**
 * 影响面扫描器 —— 改某个「字段 / 接口 / 函数」前，先扫出全库所有引用它的地方，
 * 输出「需人工核对清单」，避免"改了一处、其它页面/报表没跟着改"。
 *
 * 用法：
 *   node scripts/scan-impact.mjs <关键词>            # 扫单个词（字段名/路由名/函数名）
 *   node scripts/scan-impact.mjs a b c               # 扫多个词（OR）
 *   node scripts/scan-impact.mjs totalPrice --code   # 只在 src 里搜（排除 docs）
 *   node scripts/scan-impact.mjs /api/payments --code --show
 *
 * 默认搜 src/ + prisma/ + scripts/（排除 node_modules / .next / .workbuddy）。
 * 输出按「文件 : 出现次数」聚合，并标注命中文件属于哪一类（路由/组件/lib/报表/前端），
 * 方便一眼看出"改这个字段，哪些页面/报表会被波及"。
 *
 * 局限（务必知悉）：
 *   - 只抓「字面引用」，抓不到"业务上关联但没直接写这个词"的地方（如报表按 Payment.amount
 *     统计营收，但路由里改的是 order.totalPrice——两者语义关联、字面不关联）。
 *   - 所以它是「防漏」工具，不是「判该不该改」工具。候选点列出来后，仍需人/agent 逐条判断。
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const SHOW = args.includes('--show');
const CODE_ONLY = args.includes('--code');
const keywords = args.filter((a) => !a.startsWith('--')).map((s) => s.replace(/^["']|["']$/g, ''));

if (keywords.length === 0) {
  console.error('用法: node scripts/scan-impact.mjs <关键词...> [--code] [--show]');
  process.exit(1);
}

const ROOT = process.cwd();
// 默认搜 src/prisma/scripts/tools；--code 时连 prisma/schema 也搜（外键/字段定义）
const searchDirs = CODE_ONLY ? ['src', 'prisma', 'scripts', 'tools'] : ['src', 'prisma', 'scripts', 'tools', 'docs'];
const EXCLUDE = /node_modules|\.next|\.workbuddy|dist|build|\.git/;

function classify(file) {
  const p = path.relative(ROOT, file).split(path.sep).join('/');
  if (/api\/.+\/route\.ts$/.test(p)) return '🔌 路由(API)';
  if (/app\/\[locale\].*\.tsx$/.test(p) || /components\/.*\.tsx$/.test(p)) return '🖥️ 前端页面';
  if (/lib\/(reports|daily-report|stats)/.test(p)) return '📊 报表/统计';
  if (/lib\/.*\.ts$/.test(p)) return '🧩 lib(逻辑)';
  if (/prisma\/schema\.prisma$/.test(p)) return '🗄️ schema(表/字段)';
  if (/scripts\/.*\.(mjs|cjs|ts)$/.test(p)) return '🔧 脚本';
  if (/\.md$/.test(p)) return '📄 文档';
  return '· 其它';
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (EXCLUDE.test(full) || EXCLUDE.test(e.name)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|py|prisma|md|json)$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = [];
for (const d of searchDirs) walk(path.join(ROOT, d), files);

const hits = new Map(); // file -> Set(keywords)
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const matched = new Set();
  for (const kw of keywords) {
    // 大小写敏感的子串匹配（字段名/路由名）；统计出现次数
    let count = 0;
    let idx = content.indexOf(kw);
    while (idx !== -1) {
      count++;
      idx = content.indexOf(kw, idx + 1);
    }
    if (count > 0) {
      matched.add(`${kw} ×${count}`);
      hits.set(f, matched);
    }
  }
}

// 输出
console.log(`\n=== 影响面扫描：${keywords.join(' / ')} ===\n`);
if (hits.size === 0) {
  console.log('（无任何引用）');
  process.exit(0);
}

// 按分类分组
const byCat = new Map();
let totalFiles = 0;
for (const [f, kws] of [...hits.entries()].sort()) {
  totalFiles++;
  const cat = classify(f);
  if (!byCat.has(cat)) byCat.set(cat, []);
  byCat.get(cat).push({ f, kws });
}

// 分类展示顺序
const catOrder = ['🗄️ schema(表/字段)', '🔌 路由(API)', '📊 报表/统计', '🧩 lib(逻辑)', '🖥️ 前端页面', '🔧 脚本', '📄 文档', '· 其它'];
for (const cat of catOrder) {
  const list = byCat.get(cat);
  if (!list) continue;
  console.log(`\n【${cat}】 ${list.length} 处`);
  for (const { f, kws } of list) {
    const rel = path.relative(ROOT, f);
    console.log(`  ${rel}   ← ${[...kws].join(', ')}`);
    if (SHOW) {
      // 打印命中行
      const content = fs.readFileSync(f, 'utf8');
      content.split('\n').forEach((line, i) => {
        if (keywords.some((k) => line.includes(k))) {
          console.log(`      ${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
  }
}

console.log(`\n合计 ${totalFiles} 个文件引用了「${keywords.join(' / ')}」。`);
console.log('⚠️  这是「防漏」清单——逐条判断"改/不改/怎么改"，脚本不能替你判断业务语义。');
console.log('   特别留意：报表(📊)与路由(🔌)常"字面不关联但业务关联"（如按 Payment.amount 算营收）。');
