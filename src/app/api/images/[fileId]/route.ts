import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { downloadImage, driveEnabled } from "@/lib/server/drive";

/**
 * ドライブの画像を、このサーバーが代わりに取り出して返す(ドライブのファイルは非公開のまま)。
 * 段階4で、共有URLのお客様も「その案件の画像だけ」見られるようにする。
 */
export async function GET(_: Request, { params }: { params: Promise<{ fileId: string }> }) {
  if (!(await isAdmin())) return new NextResponse("ログインが必要です", { status: 401 });
  if (!driveEnabled()) return new NextResponse("Googleドライブが設定されていません", { status: 503 });
  try {
    const { fileId } = await params;
    if (!/^[\w-]{10,}$/.test(fileId)) return new NextResponse("不正なIDです", { status: 400 });
    const img = await downloadImage(fileId);
    if (!img.mimeType.startsWith("image/")) return new NextResponse("画像ではありません", { status: 400 });
    return new NextResponse(img.body, {
      headers: {
        "Content-Type": img.mimeType,
        // 同じIDの中身は変わらないので、ブラウザに長く覚えさせる
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    console.error(e);
    return new NextResponse("画像を取得できませんでした", { status: 502 });
  }
}
