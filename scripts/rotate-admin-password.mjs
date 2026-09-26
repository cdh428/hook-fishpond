#!/usr/bin/env node
/**
 * 轮换生产管理员口令
 * ------------------------------------------------------------------
 * 设计原则（很重要，别改坏）：
 *   1. **本脚本永远不打印口令明文** —— 只打印「写到哪个文件」。
 *      这样口令不会出现在 AI 对话、终端回滚缓冲、或任何日志里。
 *   2. 明文的唯一落点 = `.workbuddy/secrets/admin.local.env`，
 *      而 `.workbuddy/` 已在 .gitignore 中，永远不会进仓库。
 *   3. 服务端只需要 hash（bcrypt.compare），**不需要知道原口令** ——
 *      所以口令不必进 Vercel 环境变量。
 *
 * 用法：
 *   node scripts/rotate-admin-password.mjs             # 没有本地文件就生成一个；有就用现有的
 *   node scripts/rotate-admin-password.mjs --generate  # 强制重新生成一个全新口令
 *   node scripts/rotate-admin-password.mjs --print     # 把本地口令打到终端（你自己要看时用）
 *
 * ⚠️ 换完记得通知店员：收银台要用新口令登录。
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ADMIN_USERNAME = "admin";
const SECRET_DIR = path.join(".workbuddy", "secrets");
const SECRET_FILE = path.join(SECRET_DIR, "admin.local.env");

const args = process.argv.slice(2);
const FORCE_GENERATE = args.includes("--generate");
const PRINT_IT = args.includes("--print");

/**
 * 生成便于在收银台手输的强口令。
 * 去掉了容易看错的字符（0/O、1/l/I），4 组 × 4 位。
 * 字母表 57 个字符、16 位 → 约 93 bit 熵，远超暴力破解可行性。
 */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += alphabet[randomInt(0, alphabet.length)];
    groups.push(s);
  }
  return groups.join("-");
}

function readLocalPassword() {
  if (!fs.existsSync(SECRET_FILE)) return null;
  const text = fs.readFileSync(SECRET_FILE, "utf8");
  const line = text
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("ADMIN_PASSWORD="));
  if (!line) return null;
  const value = line.slice("ADMIN_PASSWORD=".length).trim();
  return value || null;
}

function writeLocalPassword(password) {
  fs.mkdirSync(SECRET_DIR, { recursive: true });
  const stamp = new Date().toISOString();
  const body = `# 乐钓鱼塘 · 生产管理员凭据（本机明文，勿提交、勿外发）
#
# 这个目录（.workbuddy/）已被 .gitignore 排除 —— 不会进公开仓库。
# 服务端只存 bcrypt hash，所以这里不需要同步到 Vercel 环境变量。
#
# 后台登录地址：/<locale>/admin   （例：/zh/admin）
# 用户名：${ADMIN_USERNAME}
# 最近一次轮换：${stamp}
# 轮换历史（只记时间，不记口令）：
${historyLines(stamp)}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${password}
`;
  fs.writeFileSync(SECRET_FILE, body, { encoding: "utf8", mode: 0o600 });
}

/** 把旧的轮换时间追加到历史里，方便你回看「上次换是什么时候」 */
function historyLines(stamp) {
  let prev = [];
  if (fs.existsSync(SECRET_FILE)) {
    prev = fs
      .readFileSync(SECRET_FILE, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith("# - "))
      .map((l) => l.trim());
  }
  return ["# - " + stamp, ...prev].map((l) => l).join("\n");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("✗ 找不到 DATABASE_URL —— .env.local 是不是缺了？");
    process.exit(1);
  }

  let password = FORCE_GENERATE ? null : readLocalPassword();
  const isNew = !password;
  if (!password) password = generatePassword();

  if (PRINT_IT) {
    // 只有你主动要的时候才打 —— 用 --print，别把它加进日常流程
    console.log("\n本地留存的当前口令（请自行抄走，别贴进聊天窗口）：\n");
    console.log("  " + password + "\n");
    return;
  }

  // 先写文件再改库：万一下面写库失败，你至少还有口令在手，不至于被锁在门外
  if (isNew || FORCE_GENERATE) writeLocalPassword(password);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.adminUser.findUnique({
      where: { username: ADMIN_USERNAME },
    });
    if (!existing) {
      console.error(`✗ 数据库里没有用户名为 ${ADMIN_USERNAME} 的管理员，先跑 seed 或检查库名。`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);

    await prisma.adminUser.update({
      where: { username: ADMIN_USERNAME },
      data: { password: hash, isActive: true },
    });

    // 自校验：把刚读回的行再比对一次，确认线上确实能用这个口令登录
    const after = await prisma.adminUser.findUnique({
      where: { username: ADMIN_USERNAME },
    });
    const ok = !!after && (await bcrypt.compare(password, after.password));

    console.log("");
    console.log("  管理员口令轮换结果");
    console.log("  ─────────────────────────────────────────────");
    console.log(`  用户名          ${ADMIN_USERNAME}（角色 ${after?.role}）`);
    console.log(`  口令明文落点    ${SECRET_FILE}`);
    console.log(`  口令本次来源    ${isNew || FORCE_GENERATE ? "新生成" : "沿用本地文件里已有的"}`);
    console.log(`  新 hash 前缀    ${String(after?.password).slice(0, 7)}…`);
    console.log(`  自校验          ${ok ? "✅ 通过（新口令可登录，旧口令已失效）" : "❌ 失败 —— 别慌，用 --print 取出本地口令再手工核对"}`);
    console.log(`  轮换时间        ${new Date().toISOString()}`);
    console.log("  ─────────────────────────────────────────────");
    console.log("");
    console.log("  接下来：");
    console.log(`   1. 打开 ${SECRET_FILE} 自己读口令（我没看见它，也不该看见）`);
    console.log("   2. 通知店员：收银台下次登录用新口令");
    console.log("   3. 想一次性踢掉所有已登录会话 → 换掉 Vercel 的 ADMIN_SESSION_SECRET");
    console.log("");

    if (!ok) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("轮换失败：", e?.message ?? e);
  process.exit(1);
});
