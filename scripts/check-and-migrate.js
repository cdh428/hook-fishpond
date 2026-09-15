#!/usr/bin/env node
/**
 * check-and-migrate.js
 * ----------------------------------------
 * Idempotent guard for the FIRST backup run.
 * If the Neon PRIMARY database is empty (no application tables), copy the
 * existing Supabase data into it once. On every subsequent daily run Neon
 * already has data, so this is a no-op and the normal backup takes over.
 */
const { execFileSync } = require("child_process");
const { Client } = require("pg");

const NEON_URL = process.env.NEON_DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

function forceDirectPort(url) { return url.replace(/:6543\//, ":5432/"); }
function withNoVerify(url) {
  if (/sslmode=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=no-verify";
}
function haveBin(bin) {
  try { execFileSync("which", [bin], { stdio: "ignore" }); return true; }
  catch { return false; }
}

const APP_TABLES = ["Pond","Spot","User","AdminUser","MenuCategory","MenuItem","Booking","Order","OrderItem","Payment"];

async function neonHasData() {
  const c = new Client({ connectionString: withNoVerify(forceDirectPort(NEON_URL)) });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema='public' AND table_name = ANY($1)`,
      [APP_TABLES],
    );
    return r.rows[0].n > 0;
  } finally {
    await c.end();
  }
}

function main() {
  if (!NEON_URL || !SUPABASE_URL) {
    console.error("❌ Missing NEON_DATABASE_URL / SUPABASE_DATABASE_URL");
    process.exit(1);
  }
  if (!haveBin("pg_dump") || !haveBin("psql")) {
    console.error("❌ pg_dump/psql required");
    process.exit(1);
  }
  neonHasData().then(has => {
    if (has) {
      console.log("✓ Neon already has data — skipping migration (daily backup will run).");
      return;
    }
    console.log("→ Neon is empty — migrating Supabase → Neon (one-time)...");
    const src = withNoVerify(forceDirectPort(SUPABASE_URL));
    const dst = withNoVerify(forceDirectPort(NEON_URL));
    const dump = execFileSync("pg_dump", [src, "--clean", "--if-exists", "--no-owner", "--no-privileges", "--format=plain"]);
    const { spawnSync } = require("child_process");
    const res = spawnSync("psql", [dst, "-v", "ON_ERROR_STOP=1"], { input: dump, maxBuffer: 256 * 1024 * 1024 });
    if (res.status !== 0) {
      console.error("❌ Migration failed:\n", res.stderr?.toString());
      process.exit(1);
    }
    console.log("✓ One-time migration Supabase → Neon complete.");
  }).catch(e => {
    console.error("❌", e.message);
    process.exit(1);
  });
}

main();
