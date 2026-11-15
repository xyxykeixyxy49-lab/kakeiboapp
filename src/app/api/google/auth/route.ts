import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { DRIVE_SCOPE, oauthConfigured } from "@/lib/server/drive";
import { googleRedirectUri } from "@/lib/server/origin";

/** 「Googleで許可」ボタン:Googleの許可画面へ移動する */
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  if (!oauthConfigured()) return new NextResponse("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません", { status: 503 });
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: await googleRedirectUri(),
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("lfd_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
