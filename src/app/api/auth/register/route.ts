import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { phone, name, language } = await request.json();

    if (!phone || !name) {
      return NextResponse.json(
        { error: "Missing required fields: phone, name" },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return NextResponse.json(existing);
    }

    const user = await prisma.user.create({
      data: {
        phone,
        name,
        language: language || "zh",
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: error.message || "Registration failed" },
      { status: 500 },
    );
  }
}
