import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildPreview, type TranslateMode } from "@/lib/menu-io";

// Vercel caps a serverless request body at 4.5 MB, so stay under it.
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }

    const modeRaw = (form.get("mode") as string | null) || "translate";
    const mode: TranslateMode = modeRaw === "keep" ? "keep" : "translate";

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "文件过大（上限 4 MB）" },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());

    try {
      const preview = await buildPreview(buf, file.name, mode);
      return NextResponse.json(preview);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "文件解析失败" },
        { status: 400 },
      );
    }
  } catch (error: any) {
    console.error("Menu import preview error:", error);
    return NextResponse.json(
      { error: error?.message || "导入预览失败" },
      { status: 500 },
    );
  }
}
