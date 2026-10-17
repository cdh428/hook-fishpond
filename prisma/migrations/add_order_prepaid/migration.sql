-- 手动订正脚本（2026-10-17）：生产库已直接执行（IF NOT EXISTS 幂等）。
-- 保留此文件以便未来 `prisma migrate reset` 重建开发库时能补上这两列。
-- Prisma Client 已同步生成（`prepaidAmount` / `prepaidNote`）。
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "prepaidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "prepaidNote" TEXT;
