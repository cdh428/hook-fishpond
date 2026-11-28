-- 社媒身份映射表（方案 A P1 骨架）
-- 背景：一个真人 = 一个 User（稳定锚点，永不改 id）；所有社媒身份走 SocialAccount 关联，
--       加新社媒只加枚举值，不动 User 表结构。Booking/Order 等业务表仍指向 User.id，零影响。
-- 现有 User.lineUserId 数据回填到 SocialAccount（幂等，可重复执行）。

-- Provider 枚举要先建，否则建表时引用不到。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Provider') THEN
    CREATE TYPE "Provider" AS ENUM (
      'LINE',
      'PHONE_OTP',
      'WECHAT',
      'FACEBOOK',
      'INSTAGRAM',
      'TIKTOK'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SocialAccount" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "provider"    "Provider" NOT NULL,
  "providerUid" TEXT NOT NULL,
  "displayName" TEXT,
  "avatarUrl"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 同一社媒同一 providerUid 只能绑一次（幂等登录靠它 find-or-create）
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_provider_providerUid_key"
  ON "SocialAccount"("provider", "providerUid");

-- 按用户查所有身份（资料页显示已绑社媒）
CREATE INDEX IF NOT EXISTS "SocialAccount_userId_idx"
  ON "SocialAccount"("userId");

-- ===== 回填：现有 User.lineUserId → SocialAccount =====
-- 幂等：ON CONFLICT 跳过已存在的（重复执行不会重复插入）
-- 注意：只回填 lineUserId 非空且不在 SocialAccount 的行
INSERT INTO "SocialAccount" ("id", "userId", "provider", "providerUid", "displayName", "createdAt", "updatedAt")
SELECT
  'sa_line_' || "id"::text,   -- 用 'sa_line_' 前缀 + User.id 做稳定 id，避免 cuid 冲突
  "id",
  'LINE'::"Provider",
  "lineUserId",
  "name",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "lineUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SocialAccount"
    WHERE "provider" = 'LINE'::"Provider"
      AND "providerUid" = "User"."lineUserId"
  )
ON CONFLICT ("provider", "providerUid") DO NOTHING;
