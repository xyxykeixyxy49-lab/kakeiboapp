"use client";

import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useCurrentProject, useEditor } from "@/store/editor";
import { TOOL_LABELS } from "@/lib/templates";
import ProjectPane from "./ProjectPane";
import FlowCanvas from "./FlowCanvas";
import RightPane from "./RightPane";

export default function AppShell() {
  const project = useCurrentProject();
  const { leftCollapsed, toggleLeft, presentation, setPresentation, undo, redo, past, future, role } = useEditor();
  const isAdmin = role === "admin";

  // キーボード操作:元に戻す / やり直す / プレゼン終了
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if (e.key === "Escape" && useEditor.getState().presentation) setPresentation(false);
      if (typing || !isAdmin) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, setPresentation, isAdmin]);

  return (
    <ReactFlowProvider>
      <div className={`flex h-screen flex-col ${presentation ? "presenting" : ""}`}>
        {/* 上部バー */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
          {isAdmin && !presentation && (
            <button
              onClick={toggleLeft}
              className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              title={leftCollapsed ? "案件一覧を開く" : "案件一覧をたたむ"}
            >
              {leftCollapsed ? "☰" : "⟨"}
            </button>
          )}
          <div className="flex items-center gap-2 font-bold text-[#06c755]">
            <span className="rounded bg-[#06c755] px-1.5 py-0.5 text-xs text-white">LINE</span>
            <span className="hidden sm:inline">構成デザイナー</span>
          </div>
          {project && (
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="text-slate-300">/</span>
              <span className="truncate font-semibold">{project.name}</span>
              {project.clientName && <span className="hidden truncate text-slate-500 md:inline">{project.clientName}</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{TOOL_LABELS[project.tool]}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && !presentation && (
              <>
                <button
                  onClick={undo}
                  disabled={!past.length}
                  className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  title="元に戻す (Ctrl+Z)"
                >
                  ↶
                </button>
                <button
                  onClick={redo}
                  disabled={!future.length}
                  className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  title="やり直す (Ctrl+Shift+Z)"
                >
                  ↷
                </button>
              </>
            )}
            <SyncBadge />
            <button
              onClick={() => setPresentation(!presentation)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                presentation ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-[#06c755] text-white hover:bg-[#05b34c]"
              }`}
            >
              {presentation ? "✕ プレゼン終了" : "▶ プレゼンモード"}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {isAdmin && !presentation && !leftCollapsed && <ProjectPane />}
          <main className="relative min-w-0 flex-1">
            {project ? (
              <FlowCanvas />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">左の一覧から案件を選ぶか、新規作成してください</div>
            )}
          </main>
          {project && <RightPane />}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

/** 同期状態の表示(段階2でNotion同期の状態を出す) */
function SyncBadge() {
  return (
    <span
      className="hidden items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700 md:flex"
      title="段階1のため、再読み込みすると内容は元に戻ります"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      保存なし(お試し版)
    </span>
  );
}
