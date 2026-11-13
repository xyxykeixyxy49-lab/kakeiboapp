import { NextResponse } from "next/server";
import { errorResponse, requireAdmin, requireNotion } from "@/lib/server/auth";
import { listNodes } from "@/lib/server/notion";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = (await requireAdmin()) ?? requireNotion();
  if (deny) return deny;
  try {
    const { id } = await params;
    return NextResponse.json({ nodes: await listNodes(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
