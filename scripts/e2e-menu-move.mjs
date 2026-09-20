/**
 * 端到端：跨大类移动菜品（工具类）
 *
 * 复现并验证用户报的 bug：「菜品移动只能在美食/饮品间移动，到不了工具类」。
 * 用真实流程跑一遍：
 *   admin 登录 → 建一个临时 TOOL 分类（= 用户在移动面板里点「＋ 新建分类」）
 *   → 把一个 FOOD 菜品移进去 → 断言它的 type 变成 TOOL
 *   → 移回原分类 → 删掉临时分类 → 断言库回到基线
 *
 * 用法：node scripts/e2e-menu-move.mjs [base]     默认 http://127.0.0.1:3100
 *
 * 会临时在生产库建 1 个 TOOL 分类并在末尾删除，全程自动回滚。
 * 跑法（先起本地生产服务）：
 *   npx next build && npx next start -p 3100
 *   node scripts/e2e-menu-move.mjs
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const ADMIN = { username: 'admin', password: 'Admin@2026' };

let pass = 0;
let fail = 0;
const ok = (name, extra = '') => {
  pass++;
  console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`);
};
const no = (name, extra = '') => {
  fail++;
  console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`);
};
const assert = (cond, name, extra = '') => (cond ? ok(name, extra) : no(name, extra));

let cookie = '';

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(init.headers || {}),
    },
    redirect: 'manual',
  });
  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, res };
}

/* ---------------- 1. 登录 ---------------- */
console.log(`\n=== 1. 管理员登录 (${BASE}) ===`);
{
  const r = await fetch(BASE + '/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const m = setCookie.match(/admin-session=([^;]+)/);
  if (r.status === 200 && m) {
    cookie = `admin-session=${m[1]}`;
    ok('登录成功并拿到 admin-session cookie');
  } else {
    no('登录失败', `status=${r.status} body=${JSON.stringify(await r.text()).slice(0, 200)}`);
    process.exit(1);
  }
}

/* ---------------- 2. 基线 ---------------- */
console.log('\n=== 2. 读取基线（复现 bug 条件） ===');
const before = await call('/api/admin/menu/categories');
assert(before.status === 200, 'GET /api/admin/menu/categories → 200');
const catsBefore = before.body;
const toolBefore = catsBefore.filter((c) => c.type === 'TOOL');
console.log(
  `     基线分类数：FOOD=${catsBefore.filter((c) => c.type === 'FOOD').length} ` +
    `DRINK=${catsBefore.filter((c) => c.type === 'DRINK').length} ` +
    `TOOL=${toolBefore.length}`,
);
if (toolBefore.length === 0) {
  ok('已复现用户场景：TOOL 大类下 0 个分类（旧版 UI 因此永远点不到工具类）');
} else {
  ok(`TOOL 大类下已有 ${toolBefore.length} 个分类（仍继续验证移动链路）`);
}

const itemsRes = await call('/api/admin/menu/items');
assert(itemsRes.status === 200, 'GET /api/admin/menu/items → 200');
const allItems = itemsRes.body;
const foodItem = allItems.find((i) => i.category?.type === 'FOOD');
if (!foodItem) {
  no('找不到任何 FOOD 菜品，无法继续');
  process.exit(1);
}
const originCatId = foodItem.categoryId;
console.log(`     取样菜品：${foodItem.name_zh}（原分类 ${originCatId}，type=FOOD）`);

/* ---------------- 3. 建临时 TOOL 分类（= 新 UI 的「新建分类」） ---------------- */
console.log('\n=== 3. 建临时 TOOL 分类 ===');
const STAMP = `__E2E_${Date.now()}`;
const createRes = await call('/api/admin/menu/categories', {
  method: 'POST',
  body: JSON.stringify({
    name_zh: `${STAMP}_工具`,
    name_en: `${STAMP}_Tools`,
    name_th: `${STAMP}_เครื่องมือ`,
    type: 'TOOL',
  }),
});
assert(createRes.status === 201, 'POST categories(type=TOOL) → 201', `id=${createRes.body?.id}`);
const toolCatId = createRes.body?.id;

const after = await call('/api/admin/menu/categories');
assert(
  after.body.filter((c) => c.type === 'TOOL').length === toolBefore.length + 1,
  'TOOL 大类下分类数 +1（旧 UI 的「工具」页签此刻变为可选）',
);

/* ---------------- 4. 跨大类移动 ---------------- */
console.log('\n=== 4. 把 FOOD 菜品移进 TOOL 分类 ===');
const moveRes = await call('/api/admin/menu/items/move', {
  method: 'POST',
  body: JSON.stringify({ ids: [foodItem.id], categoryId: toolCatId }),
});
assert(moveRes.status === 200, 'POST items/move → 200');
assert(moveRes.body?.moved === 1, 'moved === 1', JSON.stringify(moveRes.body));
assert(moveRes.body?.type === 'TOOL', '响应 type === TOOL');

const afterMove = await call('/api/admin/menu/items');
const moved = afterMove.body.find((i) => i.id === foodItem.id);
assert(moved?.categoryId === toolCatId, 'DB 里 categoryId 已指向工具分类');
assert(
  moved?.type === 'TOOL',
  'API 返回的 type 已变成 TOOL（前端 filteredItems 才会把它列到工具页签）',
  `type=${moved?.type}`,
);

/* ---------------- 5. 边界 ---------------- */
console.log('\n=== 5. 边界用例 ===');
{
  const r1 = await call('/api/admin/menu/items/move', {
    method: 'POST',
    body: JSON.stringify({ ids: [], categoryId: toolCatId }),
  });
  assert(r1.status === 400, '空 ids → 400');
  const r2 = await call('/api/admin/menu/items/move', {
    method: 'POST',
    body: JSON.stringify({ ids: [foodItem.id] }),
  });
  assert(r2.status === 400, '缺 categoryId → 400');
  const r3 = await call('/api/admin/menu/items/move', {
    method: 'POST',
    body: JSON.stringify({ ids: [foodItem.id], categoryId: 'nope-not-exist' }),
  });
  assert(r3.status === 404, '分类不存在 → 404');
  const r4 = await call('/api/admin/menu/categories', {
    method: 'POST',
    body: JSON.stringify({
      name_zh: 'x',
      name_en: 'x',
      name_th: 'x',
      type: 'NOT_A_TYPE',
    }),
  });
  assert(r4.status === 400, '非法大类 type → 400');
}

/* ---------------- 6. 回滚 ---------------- */
console.log('\n=== 6. 回滚到基线 ===');
const back = await call('/api/admin/menu/items/move', {
  method: 'POST',
  body: JSON.stringify({ ids: [foodItem.id], categoryId: originCatId }),
});
assert(back.body?.moved === 1 && back.body?.type === 'FOOD', '菜品已移回原 FOOD 分类');

const del = await call(`/api/admin/menu/categories/${toolCatId}`, { method: 'DELETE' });
assert(del.status === 200, '临时 TOOL 分类已删除', JSON.stringify(del.body));

const final = await call('/api/admin/menu/categories');
assert(
  final.body.length === catsBefore.length,
  '分类总数回到基线',
  `${final.body.length} vs ${catsBefore.length}`,
);
assert(
  final.body.filter((c) => c.type === 'TOOL').length === toolBefore.length,
  'TOOL 分类数回到基线',
);
const finalItem = (await call('/api/admin/menu/items')).body.find((i) => i.id === foodItem.id);
assert(finalItem?.categoryId === originCatId, '菜品归属回到原分类');

/* ---------------- 7. 三语页面可访问 ---------------- */
console.log('\n=== 7. 三语后台菜单页 ===');
for (const loc of ['zh', 'en', 'th']) {
  const r = await fetch(`${BASE}/${loc}/admin/menu`, {
    headers: { cookie },
    redirect: 'manual',
  });
  assert(r.status === 200, `/${loc}/admin/menu → 200`, `status=${r.status}`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} / 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
