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

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
