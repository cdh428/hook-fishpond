#!/usr/bin/env node
/**
 * migrate-supabase-to-neon.js
 * ----------------------------------------
 * One-time migration: copy the entire Supabase database (structure + data)
 * into a fresh Neon project so Neon becomes the PRIMARY database.
 *
 * This is intended to run ONCE when you first set up the Neon primary.
 * Daily backups are handled by `backup-neon-to-supabase.js` afterwards.
 *
 * Usage:
 *   NEON_DATABASE_URL="postgresql://..." SUPABASE_DATABASE_URL="postgresql://..." \
 *     node scripts/migrate-supabase-to-neon.js
 *
 * Both URLs are read from environment (GitHub Actions Secrets in CI).
 * We use `pg_dump` (from the source) + `psql` (to the target) for a faithful
 * structural + row copy. If `pg_dump`/`psql` binaries are unavailable we fall
 * back to a pure-JS table-by-table copy.
 */
const { execSync, execFileSync } = require("child_process");
const { Client } = require("pg");

const NEON_URL = process.env.NEON_DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

// Neon pools on 6543; force the direct TCP port for migrations.
function forceDirectPort(url) {
  return url.replace(/:6543\//, ":5432/");
}

// Append sslmode=no-verify so self-signed Supabase certs work locally / in CI.
function withNoVerify(url) {
  if (/sslmode=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=no-verify";
}

const TABLES = [
  "Pond", "Spot", "User", "AdminUser", "MenuCategory", "MenuItem",
  "Booking", "Order", "OrderItem", "Payment",
];

function fail(msg, e) {
  console.error("❌ " + msg);
  if (e) console.error(e.message || e);
  process.exit(1);
}

function haveBin(bin) {
  try {
    execSync(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!NEON_URL || !SUPABASE_URL) {
    fail("Missing env: NEON_DATABASE_URL and SUPABASE_DATABASE_URL are required.");
  }
  const src = withNoVerify(forceDirectPort(SUPABASE_URL));
  const dst = withNoVerify(forceDirectPort(NEON_URL));

  console.log("→ Source: Supabase (", src.replace(/\/\/[^@]+@/, "//***@"), ")");
  console.log("→ Target: Neon   (", dst.replace(/\/\/[^@]+@/, "//***@"), ")");

  // Verify both reachable
  for (const [name, url] of [["Supabase", src], ["Neon", dst]]) {
    const c = new Client({ connectionString: url });
    try {
      await c.connect();
      await c.end();
      console.log(`✓ ${name} reachable`);
    } catch (e) {
      fail(`${name} unreachable`, e);
    }
  }

  // Try native pg_dump | psql (fastest, most faithful)
  if (haveBin("pg_dump") && haveBin("psql")) {
    console.log("→ Using pg_dump | psql (fast path)");
    try {
      const dump = execFileSync("pg_dump", [
        src, "--clean", "--if-exists", "--no-owner", "--no-privileges",
        "--format=plain",
      ]);
      // Pipe through psql to Neon
      const { spawnSync } = require("child_process");
      const res = spawnSync("psql", [dst, "-v", "ON_ERROR_STOP=1"], {
        input: dump,
        maxBuffer: 1024 * 1024 * 200,
      });
      if (res.status !== 0) {
        fail("psql import failed:\n" + (res.stderr?.toString() || ""));
      }
      console.log("✓ pg_dump|psql migration complete");
      return;
    } catch (e) {
      console.warn("⚠ pg_dump path failed, falling back to JS copy:", e.message);
    }
  }

  // Pure-JS fallback: create tables via Prisma schema, copy rows
  console.log("→ Using pure-JS table copy fallback");
  const srcC = new Client({ connectionString: src });
  const dstC = new Client({ connectionString: dst });
  await srcC.connect();
  await dstC.connect();
  try {
    // Enums first
    const enums = await srcC.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
      ORDER BY t.typname, e.enumsortorder`);
    const enumMap = {};
    for (const r of enums.rows) {
      (enumMap[r.typname] ||= []).push(r.enumlabel);
    }
    for (const [name, labels] of Object.entries(enumMap)) {
      await dstC.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='${name}') THEN
          CREATE TYPE "${name}" AS ENUM (${labels.map(l => `'${l}'`).join(", ")});
        END IF;
      END $$;`);
    }

    for (const table of TABLES) {
      const cols = await srcC.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [table],
      );
      const colNames = cols.rows.map(c => `"${c.column_name}"`).join(", ");
      const rows = await srcC.query(`SELECT * FROM "${table}"`);
      if (rows.rows.length) {
        const placeholders = rows.rows[0]
          ? rows.rows[0]
          : null;
        // build insert with parameterized values
        for (const row of rows.rows) {
          const vals = cols.rows.map((_, i) => `$${i + 1}`);
          await dstC.query(
            `INSERT INTO "${table}" (${colNames}) VALUES (${vals.join(", ")})`,
            cols.rows.map(c => row[c.column_name]),
          );
        }
      }
      console.log(`✓ ${table}: ${rows.rows.length} rows`);
    }
    console.log("✓ JS migration complete");
  } finally {
    await srcC.end();
    await dstC.end();
  }
}

main().catch(e => fail("Unexpected error", e));
