#!/usr/bin/env node
/**
 * 仪表盘口径探针（只读，不碰口令）：用本地 .env.local 的 DATABASE_URL 直连 Neon，
 * 按与线上 /api/admin/stats 完全相同的口径算「今日进入收款 / 待收 / 预计」，
 * 并列出今天有效的 PaymentRecord 明细。
 * 用法：node scripts/check-dashboard.cjs
 */
const fs = require('fs');
const path = require('path');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');

function readDbUrl() {
  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = env.match(/^(?:DATABASE_URL|DIRECT_URL)=(")?(.+?)\1$/m);
  if (!m) {
    console.log('ERROR: .env.local 未找到 DATABASE_URL / DIRECT_URL');
    process.exit(1);
  }
  return m[2].replace(/^"|"$/g, '');
}

(async () => {
  const adapter = new PrismaPg({ connectionString: readDbUrl(), max: 1 });
  const prisma = new PrismaClient({ adapter });

  // 与 src/app/api/admin/stats/route.ts 同口径：本地日切 Asia/Bangkok(UTC+7)，
  // 本地 00:00 = UTC 前 17:00 → setUTCHours(10,0,0,0)
  const start = new Date();
  start.setUTCHours(10, 0, 0, 0);

  // todayPayments = Σ 当天有效(未作废) PaymentRecord
  const today = await prisma.paymentRecord.aggregate({
    where: { createdAt: { gte: start }, voidedAt: null },
    _sum: { amount: true },
  });
  const todayPayments = today._sum.amount || 0;

  // openOutstanding = Σ 未结清(未取消)订单 (totalPrice − prepaidAmount − 有效已付流水)
  const open = await prisma.order.findMany({
    where: { status: { notIn: ['SETTLED', 'CANCELLED'] } },
    select: {
      id: true,
      totalPrice: true,
      prepaidAmount: true,
      paymentRecords: { where: { voidedAt: null }, select: { amount: true } },
    },
  });
  const openOutstanding = open.reduce((sum, o) => {
    const paid = o.paymentRecords.reduce((a, r) => a + r.amount, 0);
    return sum + Math.max(0, (o.totalPrice || 0) - (o.prepaidAmount || 0) - paid);
  }, 0);

  const todayExpected = todayPayments + openOutstanding;

  console.log('== 仪表盘三格（直连 DB 计算，与 /api/admin/stats 同口径）==');
  console.log('  今日进入收款 todayPayments  =', todayPayments, '฿');
  console.log('  进行中待收   openOutstanding=', openOutstanding.toFixed(2), '฿');
  console.log('  今日预计收入 todayExpected   =', todayExpected.toFixed(2), '฿');

  console.log('\n== 今天有效 PaymentRecord 明细（未作废）==');
  const records = await prisma.paymentRecord.findMany({
    where: { createdAt: { gte: start }, voidedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { order: { select: { orderNumber: true } } },
  });
  records.forEach((r) => {
    const t = new Date(r.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Bangkok' });
    console.log('  ', t, r.kind, r.method, r.amount, '฿', r.order ? (r.order.orderNumber || '') : '');
  });
  if (!records.length) console.log('  (今天暂无有效流水)');

  await prisma.$disconnect();
})().catch((e) => {
  console.error('探针异常：', e.message);
  process.exit(4);
});
