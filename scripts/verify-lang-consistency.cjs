/* eslint-disable */
/**
 * 验证「语言一致性」P0 1-9：
 *  - 报表导出 CSV（zh / en / th）表头与枚举
 *  - 菜单导出 CSV / 模板 CSV（三语表头）
 *  - 菜单导入预览错误（用一份错误文件）
 *  - 顾客下单错误（不存在的菜品 → OptionError）
 *  - 结算消息
 *
 * 用法：BASE=http://127.0.0.1:3102 node scripts/verify-lang-consistency.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE || 'http://127.0.0.1:3102';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.workbuddy', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const log = [];
const LOG_FILE = path.join(OUT, 'lang-consistency-check.txt');
const say = (...a) => {
  const s = a.join(' ');
  log.push(s);
  console.log(s);
  // 立即落盘：接口在 dev 下很慢，不能让超时吞掉已有结果
  fs.writeFileSync(LOG_FILE, log.join('\n'), 'utf8');
};

function creds() {
  const t = fs.readFileSync(path.join(ROOT, '.workbuddy/secrets/ADMIN_PASS.txt'), 'utf8');
  return {
    user: (t.match(/^user=(.*)$/m) || [])[1].trim(),
    pass: (t.match(/^password=(.*)$/m) || [])[1].trim(),
  };
}

const ZH = /[\u4e00-\u9fff]/;

(async () => {
  const { user, pass } = creds();

  const login = await fetch(`${BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  say(`login -> ${login.status} cookie=${cookie ? 'yes' : 'NO'}`);
  if (!cookie) throw new Error('登录失败');

  /* ---------- 1. 报表导出 ---------- */
  for (const loc of ['zh', 'en', 'th']) {
    const url = `${BASE}/api/admin/reports/export?format=csv&range=today&content=orders&sheet=orders&locale=${loc}`;
    const r = await fetch(url, { headers: { cookie } });
    const txt = await r.text();
    const first = txt.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
    say(`[report ${loc}] ${r.status} 表头: ${first}`);
    say(`          含中文=${ZH.test(first)}`);
  }

  /* ---------- 2. 菜单导出 ---------- */
  for (const loc of ['zh', 'en', 'th']) {
    const r = await fetch(`${BASE}/api/admin/menu/export?format=csv&locale=${loc}`, {
      headers: { cookie },
    });
    const txt = await r.text();
    const lines = txt.replace(/^\uFEFF/, '').split(/\r?\n/);
    say(`[menu-export ${loc}] ${r.status} 表头: ${lines[0]}`);
    if (lines[1]) say(`          首行: ${lines[1].slice(0, 120)}`);
  }

  /* ---------- 3. 空白模板 ---------- */
  for (const loc of ['zh', 'en', 'th']) {
    const r = await fetch(`${BASE}/api/admin/menu/template?format=csv&locale=${loc}`, {
      headers: { cookie },
    });
    const txt = await r.text();
    const lines = txt.replace(/^\uFEFF/, '').split(/\r?\n/);
    say(`[template ${loc}] ${r.status} 表头: ${lines[0]}`);
    if (lines[1]) say(`          示例: ${lines[1].slice(0, 120)}`);
  }

  /* ---------- 4. 导入预览：缺列 + 坏价格 ---------- */
  for (const loc of ['zh', 'en', 'th']) {
    // 故意只给分类列，缺 name_zh/price
    const csv = 'Category\nX\n';
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'bad.csv');
    form.append('mode', 'keep');
    form.append('locale', loc);
    const r = await fetch(`${BASE}/api/admin/menu/import`, { method: 'POST', headers: { cookie }, body: form });
    const j = await r.json().catch(() => ({}));
    say(`[import-missing-cols ${loc}] ${r.status} ${j.error || ''}`);
  }

  for (const loc of ['zh', 'en', 'th']) {
    const csv = 'Category,Name (ZH),Price (THB)\n主食,测试菜,abc\n';
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'bad2.csv');
    form.append('mode', 'keep');
    form.append('locale', loc);
    const r = await fetch(`${BASE}/api/admin/menu/import`, { method: 'POST', headers: { cookie }, body: form });
    const j = await r.json().catch(() => ({}));
    const row = (j.rows || [])[0] || {};
    say(`[import-bad-price ${loc}] ${r.status} row.error=${row.error || '(none)'}`);
  }

  /* ---------- 5. 顾客下单错误（英文/泰文页面不应出现中文） ---------- */
  for (const loc of ['zh', 'en', 'th']) {
    const r = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'probe',
        customerPhone: '0000000000',
        items: [{ menuItemId: 'nonexistent-id-000', quantity: 1 }],
        orderType: 'TAKEAWAY',
        locale: loc,
      }),
    });
    const j = await r.json().catch(() => ({}));
    say(`[order-err ${loc}] ${r.status} code=${j.code || '-'} error=${j.error}`);
  }

  fs.writeFileSync(LOG_FILE, log.join('\n'), 'utf8');
  say(`\n写出 ${LOG_FILE}`);
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
