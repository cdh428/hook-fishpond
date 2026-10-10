import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health/db —— 数据库连通性探针（运维用）。
 *
 * 存在理由：某次线上「所有查库接口 500、但不查库的接口正常」时，
 * 光看 `{"error":"Failed to list ponds"}` 这种收敛后的文案根本无法定位。
 * 这个端点把「环境变量有没有」和「数据库连不连得上」拆开报，一眼定位。
 *
 * ⚠️ 安全约束（改这个文件时别放宽）：
 *   - 只回**布尔值**和**错误码**，绝不回显连接串 / host / 库名 / 用户名。
 *   - 不回 `error.message`：Prisma 的 message 常含 host、database name 甚至参数，
 *     本项目是 public 仓库，泄漏即事故。
 *   - 不需要鉴权：端点本身不暴露任何敏感信息。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const hasUrl = Boolean(process.env.DATABASE_URL || process.env.DIRECT_URL);

  let ok = false;
  let code: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    ok = true;
  } catch (error: any) {
    // 只取错误码（如 P1001 无法连接 / P1017 连接已关闭 / P1000 认证失败）
    code = typeof error?.code === "string" ? error.code : "UNKNOWN";
    console.error("[health/db] 数据库查询失败, code =", code);
  }

  return NextResponse.json(
    { ok, hasUrl, code },
    { status: ok ? 200 : 503 },
  );
}
