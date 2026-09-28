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
 *
 * ⚠️ 2026-09-28 修复记录（这条链路自建立起从未跑通过，逐条查到并修掉）：
 *   ④ sslmode：原来会给不带 sslmode 的 URL 追加 `sslmode=no-verify` ——
 *      那**不是** libpq 认的值（合法值只有 disable|allow|prefer|require|
 *      verify-ca|verify-full），pg_dump 会以 `invalid sslmode value` 直接退出。
 *      Neon / Supabase 的官方连接串大多不带 sslmode ⇒ 必然踩到。
 *      现改为 `sslmode=require`：加密传输但不校验证书，正是原本的意图。
 *   ⑤ maxBuffer：pg_dump 这步没设 maxBuffer（默认仅 1 MiB），数据一涨就
 *      ENOBUFS。下面 psql 那步早就设了 256 MiB，这一步以前漏了。
 */
const { execFileSync, spawnSync } = require("child_process");

const NEON_URL = process.env.NEON_DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

function forceDirectPort(url) {
  return url.replace(/:6543\//, ":5432/");
}

// libpq 只认这 6 个 sslmode 值；其它一律被拒（invalid sslmode value）。
const VALID_SSLMODES = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"];

/**
 * 保证 URL 上带一个 **合法的** libpq sslmode —— 见文件头 ④。
 *
 * Neon 和 Supabase 都强制 TLS，而 runner 上并没有 root CA 文件，
 * 所以 `require` 的行为恰好是：加密传输，但不校验证书。
 */
function ensureValidSslMode(url) {
  const m = url.match(/[?&]sslmode=([^&]*)/);
  if (!m) return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
  if (VALID_SSLMODES.includes(m[1])) return url;
  return url.replace(/([?&]sslmode=)[^&]*/, "$1require");
}

// 不依赖 `which`（runner 上多一个外部依赖没必要，Windows 上则根本没有）
function haveBin(bin) {
  const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
  return !r.error && r.status === 0;
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
  const src = ensureValidSslMode(forceDirectPort(NEON_URL));
  const dst = ensureValidSslMode(forceDirectPort(SUPABASE_URL));

  console.log("→ Backup: Neon (primary) → Supabase (cold standby)");
  console.log("  src:", src.replace(/\/\/[^@]+@/, "//***@"));
  console.log("  dst:", dst.replace(/\/\/[^@]+@/, "//***@"));

  if (!haveBin("pg_dump") || !haveBin("psql")) {
    fail("pg_dump and psql binaries are required in the CI runner. Use the GitHub Actions ubuntu runner (has postgresql-client installed).");
  }

  // 1. Dump Neon (structure + data, clean so restore is idempotent)
  let dump;
  try {
    dump = execFileSync(
      "pg_dump",
      [src, "--clean", "--if-exists", "--no-owner", "--no-privileges", "--format=plain"],
      {
        // 见文件头 ⑤：默认只有 1 MiB，数据一涨就会 ENOBUFS
        maxBuffer: 1024 * 1024 * 256,
      },
    );
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
