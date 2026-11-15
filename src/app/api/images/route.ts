import { NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { driveEnabled, uploadImage } from "@/lib/server/drive";

export const maxDuration = 60;

/** 画像をGoogleドライブへ保存する */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  if (!driveEnabled()) return NextResponse.json({ error: "Googleドライブが設定されていません" }, { status: 503 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "");
    if (!(file instanceof File) || !projectId) return NextResponse.json({ error: "画像がありません" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "画像ファイルではありません" }, { status: 400 });
    const saved = await uploadImage({
      projectId,
      projectName: String(form.get("projectName") ?? ""),
      nodeId: String(form.get("nodeId") ?? ""),
      file,
    });
    return NextResponse.json({ fileId: saved.id, url: `/api/images/${saved.id}` });
  } catch (e) {
    return errorResponse(e);
  }
}
