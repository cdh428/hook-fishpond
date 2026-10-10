#!/usr/bin/env node
import fs from 'node:fs';

/**
 * LINE 官方账号广播：把一条文本发给所有加过 @300bsham 的好友。
 *
 * ⚠️ .mjs 是 ESM，里面不能用 require()（会报 ReferenceError）—— 统一用 import。
 *
 * 用法（在仓库根目录）：
 *   node scripts/social/line-broadcast.mjs --text-file broadcast.txt [--dry-run]
 *   node scripts/social/line-broadcast.mjs --text "文字"
 *
 * 必需环境变量：
 *   LINE_CHANNEL_ACCESS_TOKEN   Messaging API 渠道令牌（与每日日报同一个，Vercel/.env.local 已有）
 *
 * 注意：
 *   - broadcast 是「发给全部好友」，没有撤回 —— 发之前务必 --dry-run 预演一遍。
 *   - 单条文本 ≤5000 字符；营销内容克制，每周至多 1–2 条（这是客服与日报共用通道）。
 *   - 推送给指定个人/群（如管理员日报）走的是 /api/cron/daily-report，不归本脚本管。
 */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--text') out.text = argv[++i];
    else if (k === '--text-file') out.textFile = argv[++i];
    else if (k === '--dry-run') out.dryRun = true;
    else { console.error('未知参数: ' + k); process.exit(2); }
  }
  return out;
}

(async () => {
  const a = parseArgs(process.argv.slice(2));
  let text = a.text || '';
  if (a.textFile) text = fs.readFileSync(a.textFile, 'utf8').trim();
  if (!text) { console.error('缺文本（--text 或 --text-file）'); process.exit(2); }
  if (text.length > 5000) { console.error(`文本 ${text.length} 字符 > 5000 上限`); process.exit(2); }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ 缺 LINE_CHANNEL_ACCESS_TOKEN（LINE Developers → Messaging API 渠道 → Issue）');
    process.exit(1);
  }

  console.log('广播文本（' + text.length + ' 字符）:\n---\n' + text + '\n---');
  if (a.dryRun) { console.log('[dry-run] 将执行 POST https://api.line.me/v2/bot/message/broadcast'); return; }

  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    // 只打状态码与截断的响应体（响应体不含令牌，但避免刷屏）
    console.error('❌ HTTP ' + res.status + ': ' + body.slice(0, 200));
    process.exit(1);
  }
  console.log('✅ 已提交广播（X-Line-Request-Id: ' + (res.headers.get('x-line-request-id') || '-') + '）');
})();
