import { NextResponse } from "next/server";
import { COOKIE, checkPassword, passwordConfigured, sessionValue } from "@/lib/server/auth";

export async function POST(req: Request) {
  if (!passwordConfigured()) return NextResponse.json({ error: "ADMIN_PASSWORD が設定されていません" }, { status: 500 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    // 総当たり対策で少し待たせる
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, sessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
