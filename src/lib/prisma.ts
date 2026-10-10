import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma client for Neon PostgreSQL (primary database).
 *
 * Neon supports IPv4 direct connections, so this works on Vercel serverless
 * (unlike Supabase which only resolved IPv6 for direct PG connections).
 *
 * The connection string is read from DATABASE_URL env var.
 * On Vercel: set DATABASE_URL to the Neon direct connection string.
 * Locally: .env.local provides the value.
 */
const connectionString =
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL ||
  "";

const adapter = new PrismaPg({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 20000,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * ⚠️ 2026-10-10 修复：原来只在「非生产」缓存到 global，生产环境每次 import 都
 * `new PrismaClient()` —— 在 Vercel serverless 上会不断新建连接池（每个自带
 * max:1 的连接），既浪费连接数、又容易把 Neon 免费档那点配额打满。
 * Next.js / Prisma 官方对 serverless 的标准写法就是**始终**复用 global 上的实例。
 */
if (!globalForPrisma.prisma) {
  if (!connectionString) {
    // 不在模块加载时抛错（那会让整个构建/路由挂掉），只告警，实际错误在查询时暴露
    console.error(
      "[prisma] DATABASE_URL / DIRECT_URL 均未设置 —— 所有数据库查询都会失败",
    );
  }
  globalForPrisma.prisma = new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma;
