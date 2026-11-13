import { NextResponse } from "next/server";
import { errorResponse, requireAdmin, requireNotion } from "@/lib/server/auth";
import { createProject, listProjects } from "@/lib/server/notion";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const deny = (await requireAdmin()) ?? requireNotion();
  if (deny) return deny;
  try {
    return NextResponse.json({ projects: await listProjects() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const deny = (await requireAdmin()) ?? requireNotion();
  if (deny) return deny;
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Project>;
    const { name, clientName, tool, status } = body;
    return NextResponse.json({ project: await createProject({ name, clientName, tool, status }) });
  } catch (e) {
    return errorResponse(e);
  }
}
