import { NextResponse } from "next/server";
import { errorResponse, requireAdmin, requireNotion } from "@/lib/server/auth";
import { trashProject, updateProject } from "@/lib/server/notion";
import { driveEnabled, trashProjectFolder } from "@/lib/server/drive";
import type { Project } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const deny = (await requireAdmin()) ?? requireNotion();
  if (deny) return deny;
  try {
    const { id } = await params;
    const { name, clientName, tool, status } = (await req.json()) as Partial<Project>;
    await updateProject(id, { name, clientName, tool, status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  const deny = (await requireAdmin()) ?? requireNotion();
  if (deny) return deny;
  try {
    const { id } = await params;
    await trashProject(id);
    // 画像フォルダもゴミ箱へ(失敗しても案件の削除は成功扱い)
    if (driveEnabled()) await trashProjectFolder(id).catch((e) => console.error(e));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
