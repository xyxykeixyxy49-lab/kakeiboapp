import { NextResponse } from "next/server";
import { isAdmin, passwordConfigured } from "@/lib/server/auth";
import { notionEnabled } from "@/lib/server/notion";

export const dynamic = "force-dynamic";

/** 画面の起動時に、保存先とログイン状態を確認する */
export async function GET() {
  return NextResponse.json({
    notion: notionEnabled(),
    passwordConfigured: passwordConfigured(),
    admin: await isAdmin(),
  });
}
