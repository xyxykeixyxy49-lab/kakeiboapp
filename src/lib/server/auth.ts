import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { notionEnabled } from "./notion";

/**
 * 管理者ログイン。
 * パスワードは環境変数 ADMIN_PASSWORD に置き、ログイン済みの印としてCookieを持たせる。
 * Cookieの中身はパスワードから作った値なので、パスワードを変えると全員ログアウトになる。
 */

export const COOKIE = "lfd_admin";

function token() {
  return createHash("sha256").update(`line-flow-designer:${process.env.ADMIN_PASSWORD}`).digest("hex");
}

export function passwordConfigured() {
  return !!process.env.ADMIN_PASSWORD;
}

export function checkPassword(input: string) {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(process.env.ADMIN_PASSWORD ?? "").digest();
  return passwordConfigured() && timingSafeEqual(a, b);
}

export function sessionValue() {
  return token();
}

export async function isAdmin() {
  // パスワード未設定かつNotionも未設定(手元でのお試し)のときだけ、ログインなしで使える
  if (!passwordConfigured()) return !notionEnabled();
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return false;
  const a = Buffer.from(c);
  const b = Buffer.from(token());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** APIの入口で使う:管理者でなければ401を返す */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (notionEnabled() && !passwordConfigured()) {
    return NextResponse.json({ error: "ADMIN_PASSWORD が設定されていません" }, { status: 500 });
  }
  if (!(await isAdmin())) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  return null;
}

/** Notion未設定なら503 */
export function requireNotion(): NextResponse | null {
  if (!notionEnabled()) return NextResponse.json({ error: "Notionが設定されていません" }, { status: 503 });
  return null;
}

export function errorResponse(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  console.error(raw);
  // よくある設定ミスは、直し方がわかる日本語にする
  let msg = raw;
  if (/Could not find (data_source|database|page)|object_not_found/i.test(raw)) {
    msg =
      "Notionのデータベースにアクセスできません。Notionで「LINE構成デザイナー(アプリ用データ)」のページを開き、右上の「•••」→「接続」から、作成したコネクトを追加してください。";
  } else if (/API token is invalid|unauthorized/i.test(raw)) {
    msg = "Notionの鍵(NOTION_TOKEN)が正しくありません。Vercelの環境変数を確認してください。";
  }
  return NextResponse.json({ error: msg, detail: raw }, { status: 502 });
}

/**
 * Claude(MCP)用の合言葉。管理者パスワードから作るので、別の設定はいらない。
 * パスワードを変えるとこの合言葉も変わり、古いURLは使えなくなる。
 */
export function mcpToken() {
  if (!passwordConfigured()) return null;
  return createHmac("sha256", process.env.ADMIN_PASSWORD!).update("line-flow-designer:mcp").digest("hex").slice(0, 40);
}

export function checkMcpToken(input: string) {
  const t = mcpToken();
  if (!t) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}
