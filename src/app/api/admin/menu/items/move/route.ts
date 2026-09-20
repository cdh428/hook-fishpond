import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * POST /api/admin/menu/items/move
 *
 * 批量把菜品移动到另一个分类——**允许跨大类**（美食 / 饮品 / 工具）。
 *
 * 为什么单开一个批量端点而不用逐个 PUT /items/[id]：
 * 生产库 Neon 在 us-east-2、店在泰国，单次往返 200~400ms（见项目记忆「事务与远端延迟」）。
 * 逐个改 10 个菜品就是 10 次往返（2~4 秒），这里合成一条 updateMany，一次往返搞定。
 *
 * body: { ids: string[], categoryId: string }
 * 返回: { moved: number, categoryId: string, type: MenuType }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const ids: unknown = body?.ids;
    const categoryId: unknown = body?.categoryId;

    if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => typeof x !== "string" || !x)) {
      return NextResponse.json(
        { error: "ids must be a non-empty array of item ids" },
        { status: 400 },
      );
    }
    if (typeof categoryId !== "string" || !categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    // 目标分类必须真实存在（否则 updateMany 会静默写进一个悬空外键）
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, type: true },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const result = await prisma.menuItem.updateMany({
      where: { id: { in: ids as string[] } },
      data: { categoryId },
    });

    return NextResponse.json({
      moved: result.count,
      categoryId: category.id,
      type: category.type,
    });
  } catch (error: any) {
    console.error("Move menu items error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to move menu items" },
      { status: 500 },
    );
  }
}
