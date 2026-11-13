"use client";

import { useMemo, useState } from "react";
import { useCurrentProject, useEditor } from "@/store/editor";
import { TOOL_LABELS } from "@/lib/templates";
import type { ProjectStatus, ToolKind } from "@/lib/types";

const STATUS_LABELS: Record<ProjectStatus, { label: string; cls: string }> = {
  draft: { label: "作成中", cls: "bg-slate-100 text-slate-600" },
  review: { label: "確認中", cls: "bg-amber-100 text-amber-700" },
  fixed: { label: "確定", cls: "bg-emerald-100 text-emerald-700" },
};

export default function ProjectPane({ embedded = false }: { embedded?: boolean }) {
  const projects = useEditor((s) => s.projects);
  const currentId = useEditor((s) => s.currentProjectId);
  const selectProject = useEditor((s) => s.selectProject);
  const createProject = useEditor((s) => s.createProject);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k
      ? projects.filter((p) => p.name.toLowerCase().includes(k) || p.clientName.toLowerCase().includes(k))
      : projects;
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [projects, q]);

  return (
    <aside className={`flex flex-col bg-white ${embedded ? "h-full w-full" : "w-64 shrink-0 border-r border-slate-200"}`}>
      <div className="space-y-2 border-b border-slate-100 p-3">
        <button
          onClick={createProject}
          className="w-full rounded-md bg-[#06c755] py-2 text-sm font-semibold text-white hover:bg-[#05b34c]"
        >
          + 新しい案件
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 案件名・お客様名で検索"
          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-[#06c755]"
        />
      </div>

      <ul className="scroll-thin min-h-24 flex-1 overflow-y-auto">
        {filtered.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => selectProject(p.id)}
              className={`w-full border-l-4 px-3 py-2 text-left hover:bg-slate-50 ${
                p.id === currentId ? "border-[#06c755] bg-emerald-50/60" : "border-transparent"
              }`}
            >
              <div className="truncate text-sm font-semibold">{p.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <span className="truncate">{p.clientName || "(お客様名未設定)"}</span>
              </div>
              <div className="mt-1 flex gap-1">
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_LABELS[p.status].cls}`}>
                  {STATUS_LABELS[p.status].label}
                </span>
                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">{TOOL_LABELS[p.tool]}</span>
              </div>
            </button>
          </li>
        ))}
        {!filtered.length && <li className="p-4 text-center text-sm text-slate-400">見つかりません</li>}
      </ul>

      <ProjectSettings />
    </aside>
  );
}

function ProjectSettings() {
  const project = useCurrentProject();
  const updateProject = useEditor((s) => s.updateProject);
  const deleteProject = useEditor((s) => s.deleteProject);
  if (!project) return null;

  const field = "w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-[#06c755]";

  return (
    <div className="scroll-thin max-h-[55%] space-y-2 overflow-y-auto border-t border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="text-xs font-bold text-slate-500">案件の設定</div>
      <label className="block">
        <span className="text-xs text-slate-500">案件名</span>
        <input className={field} value={project.name} onChange={(e) => updateProject(project.id, { name: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">お客様名</span>
        <input
          className={field}
          value={project.clientName}
          onChange={(e) => updateProject(project.id, { clientName: e.target.value })}
        />
      </label>
      <div className="flex gap-2">
        <label className="block flex-1">
          <span className="text-xs text-slate-500">拡張ツール</span>
          <select
            className={field}
            value={project.tool}
            onChange={(e) => updateProject(project.id, { tool: e.target.value as ToolKind })}
          >
            {Object.entries(TOOL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1">
          <span className="text-xs text-slate-500">ステータス</span>
          <select
            className={field}
            value={project.status}
            onChange={(e) => updateProject(project.id, { status: e.target.value as ProjectStatus })}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded border border-dashed border-slate-300 bg-white p-2">
        <div className="text-xs font-bold text-slate-500">お客様用の共有URL</div>
        <p className="mt-1 text-xs text-slate-400">段階4で発行・コピー・無効化ができるようになります</p>
        <button disabled className="mt-1 w-full rounded bg-slate-200 py-1 text-xs text-slate-400">
          共有URLを発行
        </button>
      </div>

      <button
        onClick={() => {
          if (confirm(`「${project.name}」を削除しますか?`)) deleteProject(project.id);
        }}
        className="w-full rounded py-1 text-xs text-red-500 hover:bg-red-50"
      >
        この案件を削除
      </button>
    </div>
  );
}
