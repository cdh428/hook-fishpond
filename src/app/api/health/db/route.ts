import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health/db —— 数据库连通性探针（运维用）。
 *
 * 存在理由：线上曾出现「所有查库接口 500、但不查库的接口正常」，
 * 而错误体被安全收敛成 `{"error":"Failed to list ponds"}`，根本无法定位。
 * 这个端点把「环境变量有没有」「指向哪类主机」「连不连得上」拆开报。
 *
 * ⚠️ 安全约束（改这个文件时别放宽）：
 *   - 只回**布尔值、端口、域名后缀**和**错误码**；
 *     绝不回显连接串 / 用户名 / 口令 / 完整 host / 库名。
 *     域名后缀（如 `neon.tech`）用于判断「指向的是不是 Neon」，
 *     不含凭据，风险可接受。
 *   - 不回 `error.message`：Prisma 的 message 常含 host、database name 甚至参数，
 *     本项目是 public 仓库，泄漏即事故。
 */
export const dynamic = "force-dynamic";

/** 只取域名最后两段（如 ep-xxx.c-5.us-east-2.aws.neon.tech → neon.tech） */
function hostSuffix(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.hostname.split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : u.hostname;
  } catch {
    return null;
  }
}

function portOf(url: string | undefined): number | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.port ? Number(u.port) : 5432;
  } catch {
    return null;
  }
}

export async function GET() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
  const hasUrl = Boolean(url);

  // 1) raw query（prisma.$queryRaw）—— 某些 adapter 组合下会报 P2010
  let rawOk = false;
  let rawCode: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    rawOk = true;
  } catch (error: any) {
    rawCode = typeof error?.code === "string" ? error.code : "UNKNOWN";
  }

  // 2) 走 model 查询（真正的业务路径）—— 和 raw 分开报，便于区分
  //    「adapter/raw 的问题」还是「连接本身的问题」
  let modelOk = false;
  let modelCode: string | null = null;
  let pondCount: number | null = null;
  try {
    pondCount = await prisma.pond.count();
    modelOk = true;
  } catch (error: any) {
    modelCode = typeof error?.code === "string" ? error.code : "UNKNOWN";
  }

  if (!rawOk || !modelOk) {
    console.error("[health/db] raw:", rawCode, "model:", modelCode);
  }

  const ok = rawOk && modelOk;

  return NextResponse.json(
    {
      ok,
      hasUrl,
      // 诊断用：确认 Vercel 上的连接串指向 Neon 还是别的库、走的是直连还是 pooled
      hostSuffix: hostSuffix(url),
      port: portOf(url),
      isPooled: portOf(url) === 6543,
      raw: { ok: rawOk, code: rawCode },
      model: { ok: modelOk, code: modelCode, pondCount },
    },
    { status: ok ? 200 : 503 },
  );
}
