import "server-only";

/**
 * Googleドライブとのやり取り(サーバー側専用)。
 *
 * - あなたのGoogleアカウントで1回だけ許可した「リフレッシュトークン」を使う
 * - 権限は drive.file(このアプリが作ったファイルだけ触れる)。ドライブの他のファイルは見えない
 * - 「LINE構成デザイナー」フォルダの中に、案件ごとのフォルダを作って画像を入れる
 * - ファイルは一般公開しない。表示はこのサーバーが代わりに取り出して返す
 */

// テスト用に差し替えられるようにしておく(通常は設定しない)
const OAUTH = process.env.GOOGLE_OAUTH_BASE_URL || "https://oauth2.googleapis.com";
const API = process.env.GOOGLE_API_BASE_URL || "https://www.googleapis.com";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const ROOT_NAME = "LINE構成デザイナー";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export function oauthConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
export function driveEnabled() {
  return oauthConfigured() && !!process.env.GOOGLE_REFRESH_TOKEN;
}

// ---- 認証 -------------------------------------------------------------------

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error === "invalid_grant")
      throw new Error(
        "Googleドライブの許可が切れています。アプリの「Googleドライブの設定」から許可し直し、GOOGLE_REFRESH_TOKEN を更新してください",
      );
    throw new Error(`Googleの認証に失敗しました(${body.error ?? res.status})`);
  }
  cached = { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** 許可画面から戻ってきたときに、コードをリフレッシュトークンに交換する */
export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description ?? body.error ?? `HTTP ${res.status}`);
  return body as { refresh_token?: string; access_token: string; scope: string };
}

async function drive(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Googleドライブのエラー(${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

// ---- フォルダ ---------------------------------------------------------------

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function findFolder(key: string, value: string): Promise<string | null> {
  const query = `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='${key}' and value='${q(value)}' }`;
  const res = await drive(`/drive/v3/files?${new URLSearchParams({ q: query, fields: "files(id)", pageSize: "1" })}`);
  const body = (await res.json()) as { files: { id: string }[] };
  return body.files[0]?.id ?? null;
}

async function createFolder(name: string, parent: string | null, props: Record<string, string>) {
  const res = await drive(`/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parent ? [parent] : undefined, appProperties: props }),
  });
  return ((await res.json()) as { id: string }).id;
}

const folderCache = new Map<string, string>();

async function rootFolder() {
  if (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const hit = folderCache.get("root");
  if (hit) return hit;
  const id = (await findFolder("lfdRoot", "1")) ?? (await createFolder(ROOT_NAME, null, { lfdRoot: "1" }));
  folderCache.set("root", id);
  return id;
}

async function projectFolder(projectId: string, projectName: string) {
  const hit = folderCache.get(projectId);
  if (hit) return hit;
  const id =
    (await findFolder("lfdProject", projectId)) ??
    (await createFolder(projectName || projectId, await rootFolder(), { lfdProject: projectId }));
  folderCache.set(projectId, id);
  return id;
}

// ---- ファイル ---------------------------------------------------------------

export async function uploadImage(opts: { projectId: string; projectName: string; nodeId: string; file: File }) {
  const parent = await projectFolder(opts.projectId, opts.projectName);
  const meta = {
    name: opts.file.name || "image",
    parents: [parent],
    appProperties: { lfdProject: opts.projectId, lfdNode: opts.nodeId },
  };
  const boundary = `lfd${crypto.randomUUID().replace(/-/g, "")}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${opts.file.type || "application/octet-stream"}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, await opts.file.arrayBuffer(), tail]);
  const res = await drive(`/upload/drive/v3/files?uploadType=multipart&fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()) as { id: string; name: string };
}

/** 画像の中身を取り出す(表示用) */
export async function downloadImage(fileId: string) {
  const metaRes = await drive(`/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,appProperties,trashed`);
  const meta = (await metaRes.json()) as { mimeType: string; appProperties?: Record<string, string> };
  const res = await drive(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  return { body: res.body, mimeType: meta.mimeType, projectId: meta.appProperties?.lfdProject ?? null };
}

/** 案件を消したとき、その案件のフォルダもゴミ箱へ */
export async function trashProjectFolder(projectId: string) {
  const id = await findFolder("lfdProject", projectId);
  if (!id) return;
  await drive(`/drive/v3/files/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  folderCache.delete(projectId);
}
