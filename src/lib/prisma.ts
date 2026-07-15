import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// PrismaPg adapter for Supabase PostgreSQL
// - SSL required by Supabase (rejectUnauthorized: false for Supabase's certificate)
// - max: 1 for serverless (each function instance handles one request at a time;
//   Supavisor/PgBouncer handles multiplexing across instances)
// - Connection timeouts for resilience in serverless cold-starts
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
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
