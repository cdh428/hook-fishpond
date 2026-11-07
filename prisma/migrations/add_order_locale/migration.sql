-- 票面语言：下单时界面所用的 locale（zh/en/th）。
-- 自动出单没有页面，只能按此字段决定票面语言。
-- 为空 = 历史单，回退到服务端配置 print.locale（缺省 th）。
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "locale" TEXT;
