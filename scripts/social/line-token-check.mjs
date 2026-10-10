#!/usr/bin/env node
/**
 * LINE 令牌体检（只读，绝不发任何消息）
 *
 * 用途：拿到 Channel Access Token 填进 .env.local 后，一键验证它是不是真的有效、
 *       对应的是不是 @300bsham 这个官方账号、还能发多少条推送。
 *
 * 用法（仓库根目录）：
 *   node scripts/social/line-token-check.mjs
 *
 * 它只调用 LINE 的 GET 接口（info / quota / consumption / webhook endpoint），
 * **不调用任何 push / broadcast / reply**，所以可以放心反复跑。
 *
 * 安全：令牌值绝不打印，最多显示前 4 位 + 总长度。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ENV_LOCAL = path.join(ROOT, '.env.local');

// ── 加载 .env.local（不覆盖已有的 process.env）────────────────────────
if (fs.existsSync(ENV_LOCAL)) {
  for (const line of fs.readFileSync(ENV_LOCAL, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }
}

const mask = (t) => (t ? `${t.slice(0, 4)}…（共 ${t.length} 字符）` : '(未配置)');

const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
const secret = (process.env.LINE_CHANNEL_SECRET || '').trim();

console.log('═'.repeat(64));
console.log('LINE 令牌体检（只读 · 不发消息）');
console.log('═'.repeat(64));
console.log('令牌 : ' + mask(token));
console.log('密钥 : ' + mask(secret) + '   ← 只用于 webhook 验签，发推送不需要');
console.log('');

if (!token) {
  console.log('❌ 尚未配置 LINE_CHANNEL_ACCESS_TOKEN，无法体检。');
  console.log('');
  console.log('获取步骤：');
  console.log('  1. 打开 https://developers.line.biz/console/ 并登录');
  console.log('  2. 点进你的 Provider');
  console.log('  3. 点进 Messaging API 渠道（对应官方账号 @300bsham）');
  console.log('  4. 切到「Messaging API」标签页，滚到最下面');
  console.log('  5. Channel access token → 点 Issue（签发）');
  console.log('     · 推荐选「Long-lived」（永不过期），省事');
  console.log('     · v2.1 令牌需要程序生成 JWT，本项目暂不支持，别选');
  console.log('  6. 复制那一长串，填进 .env.local：');
  console.log('       LINE_CHANNEL_ACCESS_TOKEN="<粘贴>"');
  console.log('');
  console.log('填完再跑一次本脚本即可验证。');
  process.exit(2);
}

const LINE_API = 'https://api.line.me/v2/bot';

async function get(endpoint) {
  const res = await fetch(LINE_API + endpoint, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

let allOk = true;

// ── 1. 账号身份：确认令牌对应的是不是这个官方账号 ──────────────────────
console.log('【1】账号身份  GET /v2/bot/info');
try {
  const r = await get('/info');
  if (r.ok && r.json) {
    const j = r.json;
    console.log('  ✅ 令牌有效');
    console.log('     显示名称 : ' + (j.displayName || '-'));
    console.log('     官方账号 : @' + (j.basicId || '-') + (j.basicId === '300bsham' ? '  ✅ 与目标一致' : '  ⚠️ 不是 300bsham，请确认选对了渠道'));
    console.log('     Bot UserId: ' + (j.userId || '-') + '  ← 就是官方账号自己的 ID');
    console.log('     头像/封面: ' + (j.pictureUrl ? '已设置' : '未设置') + ' / ' + (j.coverUrl ? '已设置' : '未设置'));
    if (j.basicId && j.basicId !== '300bsham') allOk = false;
  } else {
    allOk = false;
    console.log('  ❌ HTTP ' + r.status + ' — ' + (r.text || '').slice(0, 200));
    if (r.status === 401) console.log('     → 令牌无效或已被撤销。回控制台重新 Issue 一次。');
  }
} catch (e) {
  allOk = false;
  console.log('  ❌ 网络错误: ' + e.message);
  console.log('     → 若本机需要代理，node 的 fetch 不读 http_proxy；可用 curl 对照：');
  console.log('       curl -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" https://api.line.me/v2/bot/info');
}
console.log('');

// ── 2. 推送配额 ────────────────────────────────────────────────────────
console.log('【2】本月推送配额  GET /v2/bot/message/quota');
try {
  const r = await get('/message/quota');
  if (r.ok && r.json) {
    const t = r.json.type;
    if (t === 'limited') console.log('  ✅ 套餐: 限量  ' + r.json.value + ' 条/月');
    else if (t === 'notLimited') console.log('  ✅ 套餐:  Unlimited（不限量）');
    else console.log('  ✅ 套餐: ' + t + ' ' + (r.json.value ?? ''));
  } else {
    console.log('  ⚠️ HTTP ' + r.status + ' ' + (r.text || '').slice(0, 120));
  }
} catch (e) { console.log('  ⚠️ 查询失败: ' + e.message); }

try {
  const r = await get('/message/quota/consumption');
  if (r.ok && r.json) console.log('     本月已用: ' + r.json.totalUsage + ' 条');
} catch { /* 忽略 */ }
console.log('');

// ── 3. Webhook 配置（决定能不能自动采集 userId / groupId）──────────────
console.log('【3】Webhook 配置  GET /v2/bot/channel/webhook/endpoint');
try {
  const r = await get('/channel/webhook/endpoint');
  if (r.ok && r.json) {
    const ep = r.json.endpoint || '(空)';
    const active = r.json.active;
    console.log('     地址  : ' + ep);
    console.log('     启用  : ' + (active === true ? '是 ✅' : '否 ⚠️（要在控制台打开 Use webhook）'));

    // 域名改绑后 apex 会 308，webhook 若还挂在 apex 上可能收不到事件
    if (/^https:\/\/hookfishpond\.com\//.test(ep)) {
      console.log('     ⚠️ 地址用的是不带 www 的 apex。现在 apex 会 308 跳转到 www，');
      console.log('        LINE 的 webhook 是 POST，重定向可能不被跟随 → 收不到事件、采集不到 userId。');
      console.log('        建议改成: https://www.hookfishpond.com/api/webhooks/line');
    } else if (/^https:\/\/www\.hookfishpond\.com\/api\/webhooks\/line/.test(ep)) {
      console.log('     ✅ 地址已是 www 正式域名，正确');
    } else {
      console.log('     ⚠️ 地址不是本项目域名，确认一下是否正确');
    }
    if (active !== true) console.log('     → 控制台 Messaging API 标签页打开「Use webhook」');
  } else {
    console.log('  ⚠️ HTTP ' + r.status + ' ' + (r.text || '').slice(0, 120));
  }
} catch (e) { console.log('  ⚠️ 查询失败: ' + e.message); }
console.log('');

// ── 4. Channel Secret（webhook 验签用）─────────────────────────────────
console.log('【4】Channel Secret（webhook 验签必需）');
if (secret) {
  console.log('  ✅ 已配置。位置：控制台 → Basic settings 标签页 → Channel secret');
} else {
  console.log('  ⚠️ 未配置 LINE_CHANNEL_SECRET。');
  console.log('     后果：/api/webhooks/line 会直接拒绝请求（代码要求必须配），');
  console.log('     ⇒ 采集不到顾客/群的 ID ⇒ 日报推送没有目标。');
  console.log('     获取：控制台 → Basic settings 标签页 → Channel secret → 复制');
}
console.log('');

console.log('═'.repeat(64));
console.log(allOk ? '✅ 体检通过：令牌有效，可以发推送了。' : '❌ 存在问题，按上面提示处理后再跑一次。');
console.log('═'.repeat(64));
console.log('下一步：');
console.log('  # 预演（不真发）');
console.log('  node scripts/social/line-broadcast.mjs --text "测试" --dry-run');
console.log('');
console.log('  # 或推媒体（LINE + Facebook）');
console.log('  node scripts/publish/push-media.mjs --media-url <https://...> --caption "文案" --dry-run');
process.exit(allOk ? 0 : 1);
