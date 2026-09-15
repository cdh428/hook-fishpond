import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }
    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Get profile error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get profile" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const { name, language, marketingConsent } = await request.json();

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (language !== undefined) updateData.language = language;
    if (marketingConsent !== undefined)
      updateData.marketingConsent = marketingConsent;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update profile" },
      { status: 500 },
    );
  }
}
