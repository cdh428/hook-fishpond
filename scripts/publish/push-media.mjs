#!/usr/bin/env node
/**
 * 一键推送：把「Vercel 部署 + LINE 官方账号 + Facebook 主页」三条链路串起来。
 *
 * 用法（在仓库根目录）：
 *   node scripts/publish/push-media.mjs \
 *     --media-url https://hookfishpond.com/media/xxx.jpg \
 *     --caption "文案" \
 *     [--channels line,facebook]   # 默认 line+facebook
 *     [--dry-run]                   # 只预演，不真发
 *     [--auto]                      # 跳过人工确认（CI/自动化用）
 *
 * 环境变量（缺哪个就跳过哪个渠道并明确提示，绝不回显令牌值）：
 *   LINE_CHANNEL_ACCESS_TOKEN   LINE 官方账号令牌
 *   META_PAGE_TOKEN             Meta Graph API 主页令牌（不过期）
 *   FB_PAGE_ID                  Facebook 主页 ID
 *   IG_USER_ID                  Instagram 业务账号 ID（可选）
 *
 * 设计原则（来自 docs/playbooks/deploy-and-backup.md §5）：
 *   1. 凭据绝不进仓库、绝不进日志 —— 值只来自环境变量或 .env.local
 *   2. 默认「人工确认」闸门：展示待发内容后等用户输入 y 才真发
 *   3. 任一渠道失败不阻塞其它渠道，最后汇总
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 加载 .env.local（dotenv 不可用时手动解析）──────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ENV_LOCAL = path.join(ROOT, '.env.local');
if (fs.existsSync(ENV_LOCAL)) {
  for (const line of fs.readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

// ── 参数解析 ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--media-url') out.mediaUrl = argv[++i];
    else if (k === '--caption') out.caption = argv[++i];
    else if (k === '--channels') out.channels = argv[++i].split(',').map(s => s.trim());
    else if (k === '--dry-run') out.dryRun = true;
    else if (k === '--auto') out.auto = true;
    else if (k === '--line-only') out.channels = ['line'];
    else if (k === '--facebook-only') out.channels = ['facebook'];
    else if (k === '-h' || k === '--help') {
      console.log('用法: node scripts/publish/push-media.mjs --media-url <https://...> --caption "文案" [--channels line,facebook] [--dry-run] [--auto]');
      process.exit(0);
    } else { console.error('未知参数: ' + k); process.exit(2); }
  }
  out.channels = out.channels || ['line', 'facebook'];
  return out;
}

// ── 掩码（绝不打印令牌）─────────────────────────────────────────────
function maskUrl(u) {
  return String(u || '').replace(/\/\/[^@\/]+@/, '//***@').replace(/[?&]access_token=[^&]+/gi, '?***');
}
function maskToken(t) { return t ? `***(${t.length} chars)` : '(unset)'; }

// ── LINE 官方账号：发图片+视频+文本 ─────────────────────────────────────
async function pushLine(channel, a, mediaUrl, caption, dryRun) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.log('  [LINE] ⚠️ 未配置 LINE_CHANNEL_ACCESS_TOKEN，跳过。配置：LINE Developers → Messaging API 渠道 → Issue → 填进 .env.local');
    return { ok: false, reason: 'missing token' };
  }
  const baseUrl = 'https://api.line.me/v2/bot/message/broadcast';
  console.log('  [LINE] 目标: POST ' + baseUrl);
  console.log('  [LINE] 令牌: ' + maskToken(token));

  if (dryRun) { console.log('  [LINE] [dry-run] 将发送:'); console.log('        媒体: ' + maskUrl(mediaUrl)); console.log('        文案: ' + caption.slice(0, 200)); return { ok: true, dryRun: true }; }

  // 判断是图片还是视频
  const isVideo = /\.mp4(\?|$)/i.test(mediaUrl);
  const messages = [];
  if (isVideo) {
    // LINE 视频消息：content URL ≤10MB 且 ≤1分钟（18s 视频刚好合规）
    messages.push({ type: 'video', originalContentUrl: mediaUrl, previewImageUrl: process.env.LINE_VIDEO_PREVIEW_URL || '' });
  } else if (mediaUrl) {
    messages.push({ type: 'image', originalContentUrl: mediaUrl, previewImageUrl: mediaUrl });
  }
  if (caption) messages.push({ type: 'text', text: caption });

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    console.log('  [LINE] ❌ HTTP ' + res.status + ': ' + body);
    return { ok: false, reason: 'HTTP ' + res.status };
  }
  console.log('  [LINE] ✅ 广播已提交（X-Line-Request-Id: ' + (res.headers.get('x-line-request-id') || '-') + '）');
  return { ok: true };
}

// ── Facebook / Instagram：两步容器模型 ─────────────────────────────────
async function pushFacebook(channel, a, mediaUrl, caption, dryRun) {
  const token = process.env.META_PAGE_TOKEN;
  const fbPageId = process.env.FB_PAGE_ID;
  const igUserId = process.env.IG_USER_ID;
  const gv = 'v23.0';
  const doFb = !channel.includes('instagram');
  const doIg = channel.includes('instagram') || !channel.includes('facebook');

  const missing = [];
  if (!token) missing.push('META_PAGE_TOKEN');
  if (doFb && !fbPageId) missing.push('FB_PAGE_ID');
  if (doIg && !igUserId) missing.push('IG_USER_ID');
  if (missing.length) {
    console.log('  [FB] ⚠️ 未配置: ' + missing.join(', ') + '。配置步骤见 docs/playbooks/social-publishing.md「一次性准备」');
    return { ok: false, reason: 'missing tokens' };
  }

  console.log('  [FB] 目标: ' + (doFb ? 'POST /' + fbPageId + '/photos' : '') + (doIg ? ' IG 两步容器' : ''));
  console.log('  [FB] 令牌: ' + maskToken(token));
  if (dryRun) {
    console.log('  [FB] [dry-run] 将执行:');
    console.log('        媒体: ' + maskUrl(mediaUrl));
    console.log('        文案: ' + caption.slice(0, 200));
    return { ok: true, dryRun: true };
  }

  let failed = false;
  // FB 主页照片帖（支持 mp4 URL 直接发）
  if (doFb) {
    try {
      const body = new URLSearchParams({ url: mediaUrl, caption: caption, access_token: token });
      const res = await fetch(`https://graph.facebook.com/${gv}/${fbPageId}/videos`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.log('  [FB] ❌ HTTP ' + res.status + ': ' + JSON.stringify(json).slice(0, 300)); failed = true; }
      else console.log('  [FB] ✅ 视频已发布 id=' + (json.id || '-'));
    } catch (e) { failed = true; console.log('  [FB] ❌ ' + e.message.slice(0, 200)); }
  }
  // IG 两步容器
  if (doIg && igUserId) {
    try {
      const body1 = new URLSearchParams({ image_url: mediaUrl, caption: caption, access_token: token });
      const c1 = await fetch(`https://graph.facebook.com/${gv}/${igUserId}/media`, { method: 'POST', body: body1 });
      const c1j = await c1.json().catch(() => ({}));
      if (!c1j.id) { console.log('  [IG] ❌ 建容器失败: ' + JSON.stringify(c1j).slice(0, 200)); failed = true; }
      else {
        // 轮询 FINISHED（最多 90s）
        const deadline = Date.now() + 90000;
        let finished = false;
        while (Date.now() < deadline) {
          const st = await fetch(`https://graph.facebook.com/${gv}/${c1j.id}?fields=status_code,status&access_token=${token}`);
          const sj = await st.json().catch(() => ({}));
          if (sj.status_code === 'FINISHED') { finished = true; break; }
          if (sj.status_code === 'ERROR') { console.log('  [IG] ❌ 容器处理失败: ' + JSON.stringify(sj).slice(0, 200)); failed = true; break; }
          await new Promise(r => setTimeout(r, 3000));
        }
        if (!finished) { console.log('  [IG] ❌ 容器 90s 未就绪'); failed = true; }
        else {
          const body2 = new URLSearchParams({ creation_id: c1j.id, access_token: token });
          const p = await fetch(`https://graph.facebook.com/${gv}/${igUserId}/media_publish`, { method: 'POST', body: body2 });
          const pj = await p.json().catch(() => ({}));
          if (!p.ok) { console.log('  [IG] ❌ publish 失败: ' + JSON.stringify(pj).slice(0, 200)); failed = true; }
          else console.log('  [IG] ✅ 已发布 media id=' + (pj.id || '-'));
        }
      }
    } catch (e) { failed = true; console.log('  [IG] ❌ ' + e.message.slice(0, 200)); }
  }
  return { ok: !failed };
}

// ── 主流程 ─────────────────────────────────────────────────────────────
(async () => {
  const a = parseArgs(process.argv.slice(2));
  if (!a.mediaUrl) { console.error('缺 --media-url（必须是公网可访问的 https URL）'); process.exit(2); }
  if (!a.caption) { console.error('缺 --caption 文案'); process.exit(2); }
  if (!/^https:\/\//.test(a.mediaUrl)) { console.error('--media-url 必须是 https'); process.exit(2); }

  console.log('═'.repeat(60));
  console.log('一键推送：Vercel 部署 + LINE + Facebook');
  console.log('═'.repeat(60));
  console.log('媒体: ' + maskUrl(a.mediaUrl));
  console.log('文案: ' + a.caption.slice(0, 100) + (a.caption.length > 100 ? '…' : ''));
  console.log('渠道: ' + a.channels.join(', '));
  console.log('模式: ' + (a.dryRun ? '[dry-run] 只预演不真发' : a.auto ? '[auto] 跳过确认直接发' : '[confirm] 需人工确认'));
  console.log('');

  // ── 人工确认闸门（默认开启，除非 --auto）────────────────────────────
  if (!a.dryRun && !a.auto) {
    process.stdout.write('⚠️  即将向 ' + a.channels.join(' + ') + ' 发送广播/视频，确认? [y/N] ');
    const input = await new Promise(resolve => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', c => data += c);
      process.stdin.on('end', () => resolve(data));
      const timer = setTimeout(() => process.stdin.pause(), 30000);
      process.stdin.resume();
      // 30 秒无输入自动取消
      timer.unref();
    });
    if (!/^y(es)?$/i.test(input.trim())) {
      console.log('❌ 用户取消。未发送任何内容。');
      process.exit(0);
    }
  }

  // ── 执行各渠道 ─────────────────────────────────────────────────────
  const results = [];
  for (const ch of a.channels) {
    if (ch === 'line') results.push({ channel: 'LINE', ...(await pushLine(ch, a, a.mediaUrl, a.caption, a.dryRun)) });
    else if (ch === 'facebook' || ch === 'instagram' || ch === 'facebook,instagram') results.push({ channel: 'Facebook', ...(await pushFacebook(ch, a, a.mediaUrl, a.caption, a.dryRun)) });
    else if (ch === 'instagram') results.push({ channel: 'Instagram', ...(await pushFacebook('instagram', a, a.mediaUrl, a.caption, a.dryRun)) });
    else { console.log('  未知渠道: ' + ch); }
  }

  // ── 汇总 ───────────────────────────────────────────────────────────
  console.log('');
  console.log('═'.repeat(60));
  console.log('执行结果：');
  for (const r of results) {
    console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.channel + (r.dryRun ? ' [dry-run]' : '') + (r.reason ? ' — ' + r.reason : ''));
  }
  process.exit(results.some(r => !r.ok && !r.dryRun) ? 1 : 0);
})();
