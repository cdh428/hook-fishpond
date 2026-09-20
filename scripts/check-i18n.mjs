#!/usr/bin/env node
/**
 * 三语核验（zh / en / th）—— 推送前必跑
 *
 * 这件事是硬性规定：**任何页面改动推送前，必须先核验其他语言页面上的文案
 * 是否真的属于该语言**。历史上出现过"键都对齐了，但泰文页里还留着中文"
 * 的问题——只对齐 key 是查不出来的，必须查内容。
 *
 * 三层检查：
 *   1. key 对齐     —— 三语文件的键集合必须完全一致
 *   2. 语言内容     —— 各语文件里的值必须是该语言的字（zh 不得含泰文；
 *                      en 不得含中文/泰文；th 不得含中文）
 *   3. 页面渲染扫描 —— 抓取三语页面，检查渲染出来的正文里有没有串味的语言。
 *                      这一层能抓到 ①② 抓不到的问题：组件里硬编码的字符串，
 *                      以及数据库内容缺对应语言时的回退（比如 name_th 为空
 *                      就直接显示了中文菜名）。
 *
 * 用法：
 *   node scripts/check-i18n.mjs                    # 只查文件（离线，秒级）
 *   node scripts/check-i18n.mjs --live             # 再加上线上页面扫描
 *   node scripts/check-i18n.mjs --live --base http://127.0.0.1:3100
 *   node scripts/check-i18n.mjs --live-only
 *
 * 退出码：0 = 全部通过；1 = 有问题（CI / 提交前钩子可直接用）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MESSAGES_DIR = path.join(ROOT, 'messages');

const LOCALES = ['zh', 'en', 'th'];
const DEFAULT_BASE = 'https://hook-fishpond-xi15.vercel.app';

/* ------------------------------------------------------------------ *
 * 语言识别
 * ------------------------------------------------------------------ */

// 中文：CJK 汉字区 + CJK 标点。刻意不含 U+FF00–FFEF 全角区，避免 ％ 之类误报
const RE_CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F]/;
// 泰文：U+0E00–0E7F，但**排除 U+0E3F「฿」泰铢符号**——它在三语里都合法
const RE_THAI = /[\u0E00-\u0E3E\u0E40-\u0E7F]/;
const RE_LATIN = /[A-Za-z]/;

/** 各语言"不该出现"的字符集 */
const FORBIDDEN = {
  zh: [{ re: RE_THAI, label: '泰文' }],
  en: [
    { re: RE_CJK, label: '中文' },
    { re: RE_THAI, label: '泰文' },
  ],
  th: [{ re: RE_CJK, label: '中文' }],
};

/** 语言中立、允许保持原样的值（纯数字/符号/emoji、URL、邮箱） */
const NEUTRAL_PATTERNS = [
  /^[\s\d\p{P}\p{S}\p{Extended_Pictographic}]*$/u,
  /^https?:\/\/\S+$/,
  /^[\w.+-]+@[\w-]+\.[\w.]+$/,
];

const isNeutral = (v) =>
  NEUTRAL_PATTERNS.some((re) => re.test(v)) || v.trim() === '';

/* ------------------------------------------------------------------ *
 * 第 1、2 层：messages 文件
 * ------------------------------------------------------------------ */

function flatten(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatten(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const kk = `${key}[${i}]`;
        if (item && typeof item === 'object') out.push(...flatten(item, kk));
        else out.push([kk, String(item)]);
      });
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

function checkMessages() {
  const entries = {};
  const keys = {};
  for (const loc of LOCALES) {
    const file = path.join(MESSAGES_DIR, `${loc}.json`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    entries[loc] = flatten(raw);
    keys[loc] = new Set(entries[loc].map(([k]) => k));
  }

  const problems = [];

  // --- 1. key 对齐 ---
  const allKeys = new Set(LOCALES.flatMap((l) => [...keys[l]]));
  for (const key of [...allKeys].sort()) {
    for (const loc of LOCALES) {
      if (!keys[loc].has(key)) problems.push({ kind: 'KEY', loc, key });
    }
  }

  // --- 2. 语言内容 ---
  const warnings = [];
  for (const loc of LOCALES) {
    for (const [key, value] of entries[loc]) {
      if (isNeutral(value)) continue;

      for (const { re, label } of FORBIDDEN[loc]) {
        if (re.test(value)) {
          problems.push({ kind: 'LANG', loc, key, value, label });
        }
      }

      // 疑似漏译：该语言的值里一个本语言字符都没有（排除纯英文专有名词的误报只做提示）
      const hasOwn =
        loc === 'zh' ? RE_CJK.test(value) : loc === 'th' ? RE_THAI.test(value) : RE_LATIN.test(value);
      if (!hasOwn) {
        warnings.push({ kind: 'SUSPECT', loc, key, value });
      }
    }
  }

  return { problems, warnings, sizes: Object.fromEntries(LOCALES.map((l) => [l, keys[l].size])) };
}

/* ------------------------------------------------------------------ *
 * 第 3 层：页面渲染扫描
 * ------------------------------------------------------------------ */

/** 需要扫描的页面（不含 locale 前缀）——新增页面时请补进来 */
const ROUTES = [
  '',
  '/menu',
  '/booking',
  '/cart',
  '/orders',
  '/profile',
  '/admin',
  '/admin/menu',
  '/admin/menu/bulk',
  '/admin/stock',
  '/admin/stock/receipts',
  '/admin/stock/stock-takes',
  '/admin/stock/reconcile',
  '/admin/reports',
  '/admin/tables',
  '/admin/collect',
  '/admin/bookings',
  '/admin/transactions',
  '/admin/rest-days',
];

/**
 * 只取 <body> 正文再抽文字。
 * 刻意**丢掉 <head>**：`<title>` 是有意写成三语并列的 SEO 标题
 * （"Happy Fishing Pond | 乐钓鱼塘 | บ่อตกปลาแฮปปี้"），扫它只会制造误报。
 * 同理丢掉 <script>（RSC flight 数据里有同样内容）与 <style>。
 */
const bodyToText = (html) => {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const inner = m ? m[1] : html;
  return inner
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ');
};

/** 抓取命中片段（带上下文）用于人工确认 */
function snippets(text, re, ctx = 18, max = 6) {
  const out = new Set();
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = rx.exec(text)) !== null) {
    const start = Math.max(0, m.index - ctx);
    const end = Math.min(text.length, m.index + m[0].length + ctx);
    out.add(text.slice(start, end).trim());
    if (out.size >= max) break;
  }
  return [...out];
}

async function checkPages(base) {
  const problems = [];
  let scanned = 0;

  for (const loc of LOCALES) {
    for (const route of ROUTES) {
      const url = `${base.replace(/\/$/, '')}/${loc}${route}`;
      let res;
      try {
        res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      } catch (err) {
        problems.push({ kind: 'FETCH', loc, route, value: String(err?.message || err) });
        continue;
      }
      if (res.status >= 400) {
        problems.push({ kind: 'HTTP', loc, route, value: `status=${res.status}` });
        continue;
      }
      const text = bodyToText(await res.text());
      scanned++;

      for (const { re, label } of FORBIDDEN[loc]) {
        const samples = snippets(text, re);
        if (samples.length) {
          problems.push({ kind: 'PAGE', loc, route, label, samples });
        }
      }
    }
  }
  return { problems, scanned };
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const liveOnly = args.includes('--live-only');
const wantLive = liveOnly || args.includes('--live');
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1] : DEFAULT_BASE;

let failed = false;

if (!liveOnly) {
  const { problems, warnings, sizes } = checkMessages();

  console.log('=== 第 1 层 · key 对齐 ===');
  console.log(
    LOCALES.map((l) => `${l}: ${sizes[l]} keys`).join('   '),
  );

  console.log('\n=== 第 2 层 · 语言内容 ===');
  const bad = problems.filter((p) => p.kind === 'LANG');
  const miss = problems.filter((p) => p.kind === 'KEY');
  for (const p of miss) console.log(`  [MISSING] ${p.loc} 缺键  ${p.key}`);
  for (const p of bad) {
    console.log(`  [串味] ${p.loc}  ${p.key}  含${p.label}：${JSON.stringify(p.value)}`);
  }
  if (!miss.length && !bad.length) console.log('  通过：键完全对齐，且各语文件字数种正确');

  if (warnings.length) {
    console.log(`\n  · 提示 ${warnings.length} 条（值里没有本语言字符，多为专有名词/缩写，需人工扫一眼）：`);
    for (const w of warnings.slice(0, 15)) {
      console.log(`    ${w.loc}  ${w.key} = ${JSON.stringify(w.value)}`);
    }
    if (warnings.length > 15) console.log(`    …另有 ${warnings.length - 15} 条`);
  }

  if (miss.length || bad.length) failed = true;
}

if (wantLive) {
  console.log(`\n=== 第 3 层 · 页面渲染扫描 (${base}) ===`);
  const { problems, scanned } = await checkPages(base);
  if (!problems.length) {
    console.log(`  通过：${scanned} 个页面均未发现串味语言`);
  } else {
    failed = true;
    for (const p of problems) {
      if (p.kind === 'PAGE') {
        console.log(`  [串味] /${p.loc}${p.route}  正文含${p.label}：${p.samples.length} 处`);
        for (const s of p.samples) console.log(`         …${s}…`);
      } else {
        console.log(`  [${p.kind}] /${p.loc}${p.route}  ${p.value}`);
      }
    }
  }
}

console.log(failed ? '\n❌ 未通过' : '\n✅ 全部通过');
process.exit(failed ? 1 : 0);
