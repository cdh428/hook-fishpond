#!/usr/bin/env node
/**
 * 一键发帖：Facebook 主页照片帖 + Instagram 业务账号图文（两步容器模型）。
 *
 * 用法（在仓库根目录）：
 *   node scripts/social/fb-ig-post.mjs \
 *     --image-url https://hookfishpond.com/media/xxx.jpg \
 *     --caption-file caption.txt          # 或 --caption "文案"
 *     [--fb-only] [--ig-only] [--dry-run] [--graph-version v23.0]
 *
 * 必需环境变量（缺哪个就跳过哪个并明确报错，绝不回显令牌值）：
 *   META_PAGE_TOKEN   主页访问令牌（不过期；获取步骤见 docs/playbooks/social-publishing.md）
 *   FB_PAGE_ID        Facebook 主页 ID
 *   IG_USER_ID        Instagram 业务账号 ID（须与 FB 主页绑定）
 *
 * 铁律：
 *   - IG 的 --image-url 必须是 Meta 服务器可公网抓取的 URL，且只支持 JPEG ≤8MB；
 *     WebP/PNG 先转 JPG 再入库（素材流水线见 docs/playbooks/media-pipeline.md）。
 *   - 建容器返回 200 ≠ 发出去了：必须轮询 status_code=FINISHED 再 media_publish。
 *   - 本脚本永不打印令牌；出错时输出也只含响应体的 id / error message 摘要。
 */

const GRAPH_DEFAULT = 'v23.0';
const CAPTION_MAX = 2200;
const CONTAINER_TIMEOUT_MS = 90_000;
const CONTAINER_POLL_MS = 3_000;

function parseArgs(argv) {
  const out = { graphVersion: GRAPH_DEFAULT };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--image-url') out.imageUrl = argv[++i];
    else if (k === '--caption') out.caption = argv[++i];
    else if (k === '--caption-file') out.captionFile = argv[++i];
    else if (k === '--fb-only') out.fbOnly = true;
    else if (k === '--ig-only') out.igOnly = true;
    else if (k === '--dry-run') out.dryRun = true;
    else if (k === '--graph-version') out.graphVersion = argv[++i];
    else { console.error('未知参数: ' + k); process.exit(2); }
  }
  return out;
}

function mask(e) {
  // 只保留 Graph API 的 error.message，防止整段响应体把令牌回显出来
  return (e && e.error && e.error.message) ? e.error.message : String(e && e.message || e).slice(0, 200);
}

async function graph(method, path, params, token) {
  const url = new URL('https://graph.facebook.com/' + path);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) body.set(k, v);
  body.set('access_token', token);
  if (method === 'GET') url.search = body.toString();
  const res = await fetch(url, { method, body: method === 'GET' ? undefined : body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw json;
  return json;
}

async function postIg(igUserId, token, gv, imageUrl, caption) {
  console.log('[IG] 建容器 …');
  const container = await graph('POST', `${gv}/${igUserId}/media`,
    { image_url: imageUrl, caption }, token);
  if (!container.id) throw new Error('建容器未返回 id: ' + JSON.stringify(container).slice(0, 200));
  console.log('[IG] 容器 id=' + container.id + '，等待 FINISHED …');

  const deadline = Date.now() + CONTAINER_TIMEOUT_MS;
  for (;;) {
    const st = await graph('GET', `${gv}/${container.id}`,
      { fields: 'status_code,status' }, token);
    if (st.status_code === 'FINISHED') { console.log('[IG] 容器就绪'); break; }
    if (st.status_code === 'ERROR') throw new Error('容器处理失败: ' + JSON.stringify(st).slice(0, 200));
    if (Date.now() > deadline) throw new Error('容器超时未就绪（>90s），放弃 publish（容器 24h 内可手动补发）');
    await new Promise(r => setTimeout(r, CONTAINER_POLL_MS));
  }

  const published = await graph('POST', `${gv}/${igUserId}/media_publish`,
    { creation_id: container.id }, token);
  console.log('[IG] ✅ 已发布 media id=' + published.id);
}

async function postFb(pageId, token, gv, imageUrl, caption) {
  console.log('[FB] 发主页照片帖 …');
  const r = await graph('POST', `${gv}/${pageId}/photos`, { url: imageUrl, caption }, token);
  console.log('[FB] ✅ 已发布 photo id=' + r.id + (r.post_id ? ' post_id=' + r.post_id : ''));
}

(async () => {
  const a = parseArgs(process.argv.slice(2));
  if (!a.imageUrl) { console.error('缺 --image-url（必须是公网可访问的 JPEG URL）'); process.exit(2); }
  let caption = a.caption || '';
  if (a.captionFile) caption = require('fs').readFileSync(a.captionFile, 'utf8').trim();
  if (!caption) { console.error('缺文案（--caption 或 --caption-file）'); process.exit(2); }
  if (caption.length > CAPTION_MAX) {
    console.error(`文案 ${caption.length} 字符，超过 IG 上限 ${CAPTION_MAX}，先删减`);
    process.exit(2);
  }
  if (!/^https:\/\//.test(a.imageUrl)) { console.error('--image-url 必须是 https 公网 URL'); process.exit(2); }

  const token = process.env.META_PAGE_TOKEN;
  const fbPageId = process.env.FB_PAGE_ID;
  const igUserId = process.env.IG_USER_ID;
  const doFb = !a.igOnly, doIg = !a.fbOnly;

  const missing = [];
  if (doFb && !token) missing.push('META_PAGE_TOKEN');
  if (doFb && !fbPageId) missing.push('FB_PAGE_ID');
  if (doIg && !token) missing.push('META_PAGE_TOKEN');
  if (doIg && !igUserId) missing.push('IG_USER_ID');
  if (missing.length) {
    console.error('❌ 缺少环境变量: ' + [...new Set(missing)].join(', ') +
      '\n   获取步骤见 docs/playbooks/social-publishing.md（一次性准备）');
    process.exit(1);
  }

  console.log('图片: ' + a.imageUrl + '\n文案: ' + caption.length + ' 字符');
  if (a.dryRun) {
    console.log('[dry-run] 将执行: ' +
      [doFb ? 'POST /' + fbPageId + '/photos' : null,
       doIg ? 'POST /' + igUserId + '/media → 轮询 FINISHED → media_publish' : null]
        .filter(Boolean).join(' ; '));
    return;
  }

  let failed = false;
  if (doFb) { try { await postFb(fbPageId, token, a.graphVersion, a.imageUrl, caption); } catch (e) { failed = true; console.error('[FB] ❌ ' + mask(e)); } }
  if (doIg) { try { await postIg(igUserId, token, a.graphVersion, a.imageUrl, caption); } catch (e) { failed = true; console.error('[IG] ❌ ' + mask(e)); } }
  process.exit(failed ? 1 : 0);
})();
