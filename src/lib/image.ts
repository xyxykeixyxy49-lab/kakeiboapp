import { nanoid } from "nanoid";
import type { FlowImage } from "./types";

/**
 * 画像ファイルを読み込み、大きすぎる場合は縮小する。
 * 段階1ではブラウザ内(data URL)に持つだけ。段階3でGoogleドライブへ送る。
 */
export async function readImage(file: File, maxSize = 1280): Promise<FlowImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  let url = dataUrl;
  if (scale < 1 || file.size > 800_000) {
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    url = c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.85);
  }
  return { id: nanoid(8), url, name: file.name || "貼り付け画像" };
}

/** ドラッグ&ドロップ・貼り付けから画像ファイルだけ取り出す */
export function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const item of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const f = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    if (f && f.type.startsWith("image/")) out.push(f);
  }
  return out;
}
