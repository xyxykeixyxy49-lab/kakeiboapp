import { NextResponse } from "next/server";
import { errorResponse, requireAdmin, requireNotion } from "@/lib/server/auth";
import { syncNodes } from "@/lib/server/notion";
import type { FlowNode } from "@/lib/types";

// 変更が多いと時間がかかるので長めに
export const maxDuration = 60;

/** ブラウザで変更されたノードをNotionへ書き込む */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = (await requireAdmin()) ?? requireNotion();
  if (deny) return deny;
  try {
    const { id } = await params;
    const { upserts = [], deletes = [] } = (await req.json()) as { upserts?: FlowNode[]; deletes?: string[] };
    await syncNodes(
      id,
      upserts.filter((n) => n.projectId === id),
      deletes,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
