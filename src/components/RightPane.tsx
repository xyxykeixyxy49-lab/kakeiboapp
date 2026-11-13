"use client";

import { useEditor, type RightTab } from "@/store/editor";
import LinePreview from "./LinePreview";
import EditPanel from "./EditPanel";
import CommentsPanel from "./CommentsPanel";

/** 未解決コメント数(選択中のノード) */
export function useOpenCommentCount() {
  return useEditor((s) => s.comments.filter((c) => c.nodeId === s.selectedNodeId && !c.parentId && !c.resolved).length);
}

/** タブの中身(PCでは右ペイン、スマホでは1画面として使う) */
export function RightContent({ tab }: { tab: RightTab }) {
  if (tab === "preview")
    return (
      <div className="h-full bg-slate-100 p-3 md:p-4">
        <LinePreview />
      </div>
    );
  if (tab === "edit") return <EditPanel />;
  return <CommentsPanel />;
}

export default function RightPane() {
  const tab = useEditor((s) => s.rightTab);
  const setTab = useEditor((s) => s.setRightTab);
  const presentation = useEditor((s) => s.presentation);
  const role = useEditor((s) => s.role);
  const openCount = useOpenCommentCount();

  if (presentation) {
    return (
      <aside className="w-[460px] shrink-0 border-l border-slate-200 bg-slate-100 p-5">
        <LinePreview large />
      </aside>
    );
  }

  const tabs: { key: RightTab; label: string }[] = [
    { key: "preview", label: "プレビュー" },
    ...(role === "admin" ? [{ key: "edit" as const, label: "編集" }] : []),
    { key: "comments", label: "コメント" },
  ];

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <nav className="flex border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 border-b-2 py-2.5 text-sm font-semibold ${
              tab === t.key ? "border-[#06c755] text-[#06c755]" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.key === "comments" && openCount > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{openCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <RightContent tab={tab} />
      </div>
    </aside>
  );
}
