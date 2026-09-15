import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: any = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            menuItem: {
              select: { name_zh: true, name_en: true, name_th: true },
            },
          },
        },
        bookings: {
          include: { pond: true },
        },
        payment: true,
        table: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(orders || []);
  } catch (error: any) {
    console.error("Admin list orders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list orders" },
      { status: 500 },
    );
  }
}
