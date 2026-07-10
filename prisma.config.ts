import dotenv from "dotenv";
// Prisma CLI only reads .env by default; we need to load .env.local explicitly
dotenv.config({ path: ".env.local" });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // CLI commands (migrate, db push) use direct connection (port 5432)
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
