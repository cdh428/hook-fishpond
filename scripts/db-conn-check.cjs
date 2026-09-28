#!/usr/bin/env node
/* 数据库连通性探针（只读）：Neon 主库 + Supabase 冷备。
 *
 * 用法（在仓库根目录）：
 *   node scripts/db-conn-check.cjs                 # 读 .env.local 里的 DATABASE_URL / SUPABASE_DATABASE_URL
 *   DATABASE_URL=... node scripts/db-conn-check.cjs  # 或直接注入环境变量（CI 里可这么用）
 *
 * 依赖：pg、dotenv（仓库 node_modules 里有）。若本工作区没装依赖，
 * 用 NODE_PATH 指向另一份装好的检出：NODE_PATH=D:/Github/hook-fishpond/node_modules node scripts/db-conn-check.cjs
 *
 * 安全：只执行 SELECT 级查询；输出只含 host、服务端版本、public 表数量，**永不打印连接串**。
 */
const path = require('path');

let Client;
try { ({ Client } = require('pg')); }
catch { console.error('缺 pg 依赖 —— 用 NODE_PATH=<repo>/node_modules 后重跑'); process.exit(2); }
try { require('dotenv').config({ path: path.join(process.cwd(), '.env.local') }); } catch {}

function hostOf(u) { try { return new URL(u).host; } catch { return '(unparseable)'; } }

async function probe(name, cs) {
  if (!cs) { console.log(name + ': SKIP (env not set)'); return true; } // 未配置不算失败（本机可以不配冷备）
  const c = new Client({ connectionString: cs, connectionTimeoutMillis: 15000 });
  try {
    await c.connect();
    const r = await c.query(
      "select current_setting('server_version') as v, " +
      "(select count(*)::int from information_schema.tables where table_schema='public') as t");
    console.log(name + ': OK host=' + hostOf(cs) + ' pg=' + r.rows[0].v + ' publicTables=' + r.rows[0].t);
    return true;
  } catch (e) {
    console.log(name + ': FAIL host=' + hostOf(cs) + ' err=' + String(e.message || e).split('\n')[0].slice(0, 120));
    return false;
  } finally { try { await c.end(); } catch {} }
}

(async () => {
  const okNeon = await probe('NEON     DATABASE_URL', process.env.DATABASE_URL);
  const okSupa = await probe('SUPABASE DATABASE_URL', process.env.SUPABASE_DATABASE_URL);
  process.exit(okNeon ? 0 : 1); // 主库连不上才算失败；冷备未配置/失败只提醒
})();
