import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { buildPreview, type TranslateMode } from "@/lib/menu-io";
import { serverT, requestLocale } from "@/lib/server-t";

// Vercel caps a serverless request body at 4.5 MB, so stay under it.
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * POST /api/admin/menu/import —— 解析上传文件并返回导入预览
 *
 * **语言**：表单字段 `locale` 优先，其次 Referer。
 * 这里的错误与每一行的校验/变更描述都按该语言返回，直接显示在后台页面上。
 */
export async function POST(request: NextRequest) {
  let reqLocale = requestLocale({ request });
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    reqLocale = requestLocale({
      bodyLocale: form.get("locale"),
      request,
    });
    const t = await serverT(reqLocale);

    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: t("apiErr.fileMissing") }, { status: 400 });
    }

    const modeRaw = (form.get("mode") as string | null) || "translate";
    const mode: TranslateMode = modeRaw === "keep" ? "keep" : "translate";

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: t("apiErr.fileTooLarge") },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());

    try {
      const preview = await buildPreview(buf, file.name, mode, {
        locale: reqLocale,
        t,
      });
      return NextResponse.json(preview);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || t("apiErr.fileParseFailed") },
        { status: 400 },
      );
    }
  } catch (error: any) {
    console.error("Menu import preview error:", error);
    const t = await serverT(reqLocale);
    return NextResponse.json(
      { error: error?.message || t("apiErr.importPreviewFailed") },
      { status: 500 },
    );
  }
}
