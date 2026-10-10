#!/usr/bin/env node
/**
 * export-neon-sql.cjs —— 把 Neon 生产库导出成一份可重放的 SQL 冷备文件。
 * ------------------------------------------------------------------
 * 为什么不用原来的 backup-neon-to-supabase.js：
 *   那个脚本依赖 pg_dump / psql 二进制，且要求 >= PG18；本机 Windows 没有
 *   这些工具，CI 上还要额外装 postgresql-client-18。本脚本纯用 pg driver，
 *   本机和 CI 都能跑，无版本限制。
 *
 * 导出内容：
 *   - 数据：每张表的 INSERT 语句（TRUNCATE + INSERT，保证重放幂等）
 *   - 结构：不导出 DDL —— schema 由 prisma/schema.prisma 管（已进 git），
 *     恢复时先 `prisma db push` 建表，再灌本文件的数据。
 *
 * 用法：
 *   node scripts/backup/export-neon-sql.cjs
 * 产物：
 *   backups/neon-<ISO日期>.sql   （该目录必须 gitignore，含真实业务数据）
 *
 * ⚠️ 方向永远是 Neon(源) → 文件/冷备(目标)。绝不可反向覆盖生产库。
 */
const fs = require("fs");
const path = require("path");
const pg = require("pg");

const ROOT = process.cwd();

// 读 .env.local（不引 dotenv，避免加载顺序坑）
function readEnv() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = readEnv();
const SRC = env.DATABASE_URL || env.NEON_DATABASE_URL;

if (!SRC) {
  console.error("❌ .env.local 里没有 DATABASE_URL / NEON_DATABASE_URL");
  process.exit(1);
}

// Neon pooled 端口 6543 对某些会话操作有限制，导出走直连 5432
const srcUrl = SRC.replace(/:6543\//, ":5432/");

function mask(u) {
  return u.replace(/\/\/[^@]+@/, "//***:***@");
}

/** 把 JS 值转成 SQL 字面量 */
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString("hex")}'`;
  if (Array.isArray(v) || typeof v === "object") {
    // json/jsonb 与数组类型
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

function q(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function main() {
  console.log("→ 导出 Neon 冷备");
  console.log("  src:", mask(srcUrl));

  const src = new pg.Client({
    connectionString: srcUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await src.connect();

  // 1. 取所有普通表（排除视图/系统表）
  const t = await src.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  const tables = t.rows.map((r) => r.tablename);
  console.log("  表数量:", tables.length);

  const out = [];
  out.push("-- ============================================================");
  out.push("-- Hook Fishpond · Neon 冷备导出（纯 SQL，可重放）");
  out.push(`-- 导出时间: ${new Date().toISOString()}`);
  out.push(`-- 源库: ${mask(srcUrl)}`);
  out.push("-- 恢复顺序: 1) prisma db push 建表  2) 执行本文件");
  out.push("-- ⚠️ 含真实业务数据，禁止提交进 git / 外发");
  out.push("-- ============================================================");
  out.push("");
  out.push("BEGIN;");
  out.push("");

  let totalRows = 0;
  for (const name of tables) {
    const res = await src.query(`SELECT * FROM ${q(name)}`);
    const rows = res.rows;
    const cols = res.fields.map((f) => f.name);
    totalRows += rows.length;

    // 幂等：先清空（CASCADE 处理外键）
    out.push(`TRUNCATE TABLE ${q(name)} CASCADE;`);
    if (rows.length === 0) {
      out.push(`-- ${name}: 0 行`);
      out.push("");
      continue;
    }

    const colList = cols.map(q).join(", ");
    // 每 200 行一批，避免单条 SQL 过长
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values = chunk
        .map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`)
        .join(",\n");
      out.push(`INSERT INTO ${q(name)} (${colList}) VALUES`);
      out.push(values + ";");
    }
    out.push(`-- ${name}: ${rows.length} 行`);
    out.push("");
  }

  out.push("COMMIT;");
  out.push("");
  out.push(`-- 导出完成：${tables.length} 表 / ${totalRows} 行`);

  await src.end();

  const dir = path.join(ROOT, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `neon-${new Date().toISOString().slice(0, 10)}.sql`);
  fs.writeFileSync(file, out.join("\n"), "utf8");

  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`✓ 已写出: backups/${path.basename(file)} (${kb} KB)`);
  console.log(`🎉 导出完成：${tables.length} 表 / ${totalRows} 行`);
}

main().catch((e) => {
  console.error("❌ 导出失败:", e.message);
  process.exit(1);
});
