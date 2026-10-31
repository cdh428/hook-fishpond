// 只读：扫描重名 MenuItem + 被哪些表引用（决定能否安全删除/停用）
import fs from 'node:fs';
import pg from 'pg';

const env = fs.readFileSync('.env.local', 'utf8');
const pick = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
};
const url = pick('DIRECT_URL') || pick('DATABASE_URL');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// 1. 找出所有引用 MenuItem 的表/列
const refs = await c.query(
  `select table_name, column_name from information_schema.columns
   where table_schema='public' and column_name in ('menuItemId','itemId','menu_item_id')
   order by table_name`,
);
console.log('=== 引用 MenuItem 的表 ===');
for (const r of refs.rows) console.log(`  ${r.table_name}.${r.column_name}`);

// 2. 重名组（按 name_zh 归一化）
const dups = await c.query(
  `select lower(btrim("name_zh")) as k, count(*)::int as n
   from "MenuItem" group by 1 having count(*) > 1 order by n desc, k`,
);
console.log(`\n=== 重名组 ${dups.rowCount} 个 ===`);

for (const g of dups.rows) {
  const items = await c.query(
    `select m.id, m."name_zh", m."name_en", m."name_th", m."categoryId", m."stockType",
            m."stockQty", m."soldOut", m."isActive", m.price, m."createdAt",
            cat."name_zh" as cat_zh
     from "MenuItem" m left join "MenuCategory" cat on cat.id = m."categoryId"
     where lower(btrim(m."name_zh")) = $1
     order by m."createdAt"`,
    [g.k],
  );
  console.log(`\n--- 「${items.rows[0].name_zh}」 x${items.rowCount}  (大类: ${items.rows.map((r) => r.cat_zh).join(' | ')}) ---`);
  for (const it of items.rows) {
    const counts = [];
    for (const r of refs.rows) {
      const q = await c.query(
        `select count(*)::int as n from "${r.table_name}" where "${r.column_name}" = $1`,
        [it.id],
      );
      if (q.rows[0].n > 0) counts.push(`${r.table_name}=${q.rows[0].n}`);
    }
    console.log(
      `  id=${it.id}  type=${it.stockType}  qty=${it.stockQty ?? '-'}  soldOut=${it.soldOut}  active=${it.isActive}  price=${it.price}`,
    );
    console.log(`      created=${it.createdAt.toISOString().slice(0, 16)}  引用: ${counts.length ? counts.join(' , ') : '(无)'}`);
  }
}

await c.end();
