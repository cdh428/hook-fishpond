-- 全局键值配置表（打印偏好等）
-- 手机与收银机共用同一份配置，替代原先存在浏览器 localStorage 的「各存各的」。
CREATE TABLE IF NOT EXISTS "Setting" (
  "key"       TEXT PRIMARY KEY,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
