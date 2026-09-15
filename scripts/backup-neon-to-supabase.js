#!/usr/bin/env node
/**
 * backup-neon-to-supabase.js
 * ----------------------------------------
 * Daily cold-standby backup: dump the Neon PRIMARY database and restore it
 * into the Supabase FREE tier, which acts as an offline replica.
 *
 * Why this matters:
 *  - Gives you a second copy of all production data (disaster recovery).
 *  - The daily write to Supabase keeps the free project "active", so it
 *    NEVER hits Supabase's 7-day inactivity pause. Your standby stays warm.
 *
 * Schedule: runs every day at 00:00 Bangkok time (= 17:00 UTC) via
 *          .github/workflows/db-backup.yml (GitHub Actions).
 *
 * Usage:
 *   NEON_DATABASE_URL="postgresql://..." SUPABASE_DATABASE_URL="postgresql://..." \
 *     node scripts/backup-neon-to-supabase.js
 */
const { execFileSync, spawnSync } = require("child_process");

const NEON_URL = process.env.NEON_DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

function forceDirectPort(url) {
  return url.replace(/:6543\//, ":5432/");
}
function withNoVerify(url) {
  if (/sslmode=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=no-verify";
}
function haveBin(bin) {
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function fail(msg, e) {
  console.error("❌ " + msg);
  if (e && (e.message || e.stderr)) console.error(e.message || e.stderr.toString());
  process.exit(1);
}

function main() {
  if (!NEON_URL || !SUPABASE_URL) {
    fail("Missing env: NEON_DATABASE_URL and SUPABASE_DATABASE_URL are required.");
  }
  const src = withNoVerify(forceDirectPort(NEON_URL));
  const dst = withNoVerify(forceDirectPort(SUPABASE_URL));

  console.log("→ Backup: Neon (primary) → Supabase (cold standby)");
  console.log("  src:", src.replace(/\/\/[^@]+@/, "//***@"));
  console.log("  dst:", dst.replace(/\/\/[^@]+@/, "//***@"));

  if (!haveBin("pg_dump") || !haveBin("psql")) {
    fail("pg_dump and psql binaries are required in the CI runner. Use the GitHub Actions ubuntu runner (has postgresql-client installed).");
  }

  // 1. Dump Neon (structure + data, clean so restore is idempotent)
  let dump;
  try {
    dump = execFileSync("pg_dump", [
      src, "--clean", "--if-exists", "--no-owner", "--no-privileges",
      "--format=plain",
    ]);
  } catch (e) {
    fail("pg_dump from Neon failed", e);
  }
  console.log(`✓ Dumped Neon (${Math.round(dump.length / 1024)} KB)`);

  // 2. Restore into Supabase (overwrites standby copy each day)
  const res = spawnSync("psql", [dst, "-v", "ON_ERROR_STOP=1"], {
    input: dump,
    maxBuffer: 1024 * 1024 * 256,
  });
  if (res.status !== 0) {
    fail("psql restore to Supabase failed", res);
  }
  console.log("✓ Restored into Supabase standby");
  console.log("🎉 Daily backup complete at", new Date().toISOString());
}

main();
