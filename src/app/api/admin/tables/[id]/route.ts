import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * Admin — update or deactivate a dining table.
 *
 * PUT  /api/admin/tables/[id]  → edit code / names / area / isActive
 * DELETE /api/admin/tables/[id] → soft-delete (isActive=false) when the table
 *                                 already has orders, hard-delete otherwise.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { code, name_zh, name_en, name_th, area, isActive } = body;

    const updateData: Record<string, any> = {};
    if (code !== undefined) updateData.code = String(code).toUpperCase().trim();
    if (name_zh !== undefined) updateData.name_zh = name_zh;
    if (name_en !== undefined) updateData.name_en = name_en;
    if (name_th !== undefined) updateData.name_th = name_th;
    if (area !== undefined) {
      if (area !== "HUT" && area !== "CAFE") {
        return NextResponse.json({ error: "area must be HUT or CAFE" }, { status: 400 });
      }
      updateData.area = area;
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    // Guard against duplicate codes
    if (updateData.code) {
      const clash = await prisma.diningTable.findFirst({
        where: { code: updateData.code, NOT: { id } },
      });
      if (clash) {
        return NextResponse.json(
          { error: `Table code ${updateData.code} already exists` },
          { status: 409 },
        );
      }
    }

    const table = await prisma.diningTable.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(table);
  } catch (error: any) {
    console.error("Update table error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update table" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Tables with order history are deactivated, never hard-deleted
    const orderCount = await prisma.order.count({ where: { tableId: id } });

    if (orderCount > 0) {
      await prisma.diningTable.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        message: "Table deactivated (has order history)",
        deactivated: true,
      });
    }

    await prisma.diningTable.delete({ where: { id } });
    return NextResponse.json({ message: "Table deleted" });
  } catch (error: any) {
    console.error("Delete table error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete table" },
      { status: 500 },
    );
  }
}
