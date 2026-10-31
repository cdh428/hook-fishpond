// 删除重名/幽灵菜单条目（先备份为 JSON，再验证无引用后硬删）
// 用法：node scripts/_dup-menu-cleanup.mjs <menuItemId>
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const id = process.argv[2];
if (!id) {
  console.error('usage: node scripts/_dup-menu-cleanup.mjs <menuItemId>');
  process.exit(1);
}

const env = fs.readFileSync('.env.local', 'utf8');
const pick = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
};
const url = pick('DIRECT_URL') || pick('DATABASE_URL');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`select * from "MenuItem" where id = $1`, [id]);
if (!rows.length) {
  console.error('not found:', id);
  await c.end();
  process.exit(1);
}
const row = rows[0];
console.log('目标条目:', row.name_zh, '| qty=', row.stockQty, '| categoryId=', row.categoryId);

// 引用检查
const refs = await c.query(
  `select table_name, column_name from information_schema.columns
   where table_schema='public' and column_name in ('menuItemId','itemId','menu_item_id')`,
);
const blocking = [];
for (const r of refs.rows) {
  const q = await c.query(
    `select count(*)::int as n from "${r.table_name}" where "${r.column_name}" = $1`,
    [id],
  );
  if (q.rows[0].n > 0) blocking.push(`${r.table_name}=${q.rows[0].n}`);
}
if (blocking.length) {
  console.error('❌ 存在引用，拒绝删除:', blocking.join(', '));
  console.error('   → 请改用 isActive=false（停用）而非删除');
  await c.end();
  process.exit(1);
}
console.log('引用检查通过：无任何历史引用');

// 备份
const dir = '.workbuddy/backups';
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `deleted-menu-item-${id}-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify(row, null, 2));
console.log('已备份 →', file);

await c.query(`delete from "MenuItem" where id = $1`, [id]);
console.log('✅ 已删除', id);

const left = await c.query(
  `select count(*)::int as n from "MenuItem" where lower(btrim("name_zh")) = lower(btrim($1))`,
  [row.name_zh],
);
console.log(`剩余同名条目: ${left.rows[0].n}`);
await c.end();
