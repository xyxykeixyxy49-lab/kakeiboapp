"use client";

import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useCurrentProject, useEditor, type MobileView } from "@/store/editor";
import { TOOL_LABELS } from "@/lib/templates";
import { useIsMobile } from "@/lib/useIsMobile";
import ProjectPane from "./ProjectPane";
import FlowCanvas from "./FlowCanvas";
import RightPane, { RightContent, useOpenCommentCount } from "./RightPane";
import LinePreview from "./LinePreview";

export default function AppShell() {
  const project = useCurrentProject();
  const isMobile = useIsMobile();
  const leftCollapsed = useEditor((s) => s.leftCollapsed);
  const presentation = useEditor((s) => s.presentation);
  const canvasFull = useEditor((s) => s.canvasFull);
  const mobileView = useEditor((s) => s.mobileView);
  const projectDrawer = useEditor((s) => s.projectDrawer);
  const role = useEditor((s) => s.role);
  const { setPresentation, setCanvasFull, setProjectDrawer, undo, redo } = useEditor.getState();
  const isAdmin = role === "admin";

  // キーボード操作:元に戻す / やり直す / Escで全画面・プレゼン終了
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if (e.key === "Escape") {
        const s = useEditor.getState();
        if (s.pendingConnect) s.setPendingConnect(null);
        else if (s.canvasFull) s.setCanvasFull(false);
        else if (s.presentation) s.setPresentation(false);
      }
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
  }, [undo, redo, isAdmin]);

  // 全画面:ブラウザの全画面機能が使えれば使う(iPhoneのSafariなど使えない環境では画面いっぱいに広げるだけ)
  useEffect(() => {
    const el = document.documentElement;
    if (canvasFull && !document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
    if (!canvasFull && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [canvasFull]);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && useEditor.getState().canvasFull) setCanvasFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [setCanvasFull]);

  const showDesktopLeft = !isMobile && isAdmin && !presentation && !leftCollapsed && !canvasFull;
  const showDesktopRight = !isMobile && !!project && !canvasFull;

  return (
    <ReactFlowProvider>
      <div className={`flex h-[100dvh] flex-col ${presentation ? "presenting" : ""}`}>
        {!canvasFull && <Header isMobile={isMobile} />}

        <div className="relative flex min-h-0 flex-1">
          {showDesktopLeft && <ProjectPane />}
          <main className="relative min-w-0 flex-1">
            {project ? (
              <FlowCanvas />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-slate-400">
                {isMobile ? "左上の ☰ から案件を選ぶか、新規作成してください" : "左の一覧から案件を選ぶか、新規作成してください"}
              </div>
            )}
            {/* スマホ:構成図以外のタブは構成図の上に重ねて表示 */}
            {isMobile && project && mobileView !== "canvas" && !canvasFull && (
              <div className="scroll-thin absolute inset-0 z-20 overflow-y-auto bg-white">
                <RightContent tab={mobileView} />
              </div>
            )}
            {canvasFull && project && <FloatingPreview isMobile={isMobile} />}
          </main>
          {showDesktopRight && <RightPane />}
        </div>

        {isMobile && project && !canvasFull && <BottomNav />}

        {/* スマホ:案件一覧は左から出るメニュー */}
        {isMobile && isAdmin && projectDrawer && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex h-full w-[85%] max-w-xs flex-col bg-white shadow-xl">
              <ProjectPane embedded />
            </div>
            <button className="flex-1 bg-black/40" onClick={() => setProjectDrawer(false)} aria-label="閉じる" />
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}

/** 上部バー */
function Header({ isMobile }: { isMobile: boolean }) {
  const project = useCurrentProject();
  const presentation = useEditor((s) => s.presentation);
  const leftCollapsed = useEditor((s) => s.leftCollapsed);
  const isAdmin = useEditor((s) => s.role === "admin");
  const { setPresentation, setProjectDrawer, undo, redo } = useEditor.getState();
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const toggleLeft = useEditor((s) => s.toggleLeft);
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 md:gap-3 md:px-3">
      {isAdmin && !presentation && (
        <button
          onClick={() => (isMobile ? setProjectDrawer(true) : toggleLeft())}
          className="rounded px-2 py-1.5 text-slate-500 hover:bg-slate-100"
          title={leftCollapsed ? "案件一覧を開く" : "案件一覧をたたむ"}
        >
          {isMobile || leftCollapsed ? "☰" : "⟨"}
        </button>
      )}
      <div className="flex shrink-0 items-center gap-2 font-bold text-[#06c755]">
        <span className="rounded bg-[#06c755] px-1.5 py-0.5 text-xs text-white">LINE</span>
        <span className="hidden lg:inline">構成デザイナー</span>
      </div>
      {project && (
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-slate-300 md:inline">/</span>
          <span className="truncate font-semibold">{project.name}</span>
          {project.clientName && <span className="hidden truncate text-slate-500 lg:inline">{project.clientName}</span>}
          <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 md:inline">
            {TOOL_LABELS[project.tool]}
          </span>
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        {isAdmin && !presentation && (
          <>
            <button
              onClick={undo}
              disabled={!past}
              className="rounded px-2 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              title="元に戻す (Ctrl+Z)"
            >
              ↶
            </button>
            <button
              onClick={redo}
              disabled={!future}
              className="rounded px-2 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              title="やり直す (Ctrl+Shift+Z)"
            >
              ↷
            </button>
          </>
        )}
        <SyncBadge />
        <button
          onClick={() => setPresentation(!presentation)}
          className={`rounded-md px-2.5 py-1.5 text-sm font-semibold md:px-3 ${
            presentation ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-[#06c755] text-white hover:bg-[#05b34c]"
          }`}
          title="プレゼンモード"
        >
          {presentation ? "✕" : "▶"}
          <span className="hidden md:inline">{presentation ? " プレゼン終了" : " プレゼンモード"}</span>
        </button>
      </div>
    </header>
  );
}

/** スマホ下部のタブ */
function BottomNav() {
  const mobileView = useEditor((s) => s.mobileView);
  const setMobileView = useEditor((s) => s.setMobileView);
  const role = useEditor((s) => s.role);
  const presentation = useEditor((s) => s.presentation);
  const openCount = useOpenCommentCount();
  const items: { key: MobileView; icon: string; label: string }[] = [
    { key: "canvas", icon: "🗺️", label: "構成図" },
    { key: "preview", icon: "📱", label: "プレビュー" },
    ...(role === "admin" && !presentation ? [{ key: "edit" as const, icon: "✏️", label: "編集" }] : []),
    ...(!presentation ? [{ key: "comments" as const, icon: "💬", label: "コメント" }] : []),
  ];
  return (
    <nav className="flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => setMobileView(it.key)}
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
            mobileView === it.key ? "text-[#06c755]" : "text-slate-500"
          }`}
        >
          <span className="text-lg leading-none">{it.icon}</span>
          {it.label}
          {it.key === "comments" && openCount > 0 && (
            <span className="absolute right-[22%] top-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{openCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

/** 全画面のときに右下に浮かべるプレビュー */
function FloatingPreview({ isMobile }: { isMobile: boolean }) {
  const show = useEditor((s) => s.mobileView === "preview");
  const setMobileView = useEditor((s) => s.setMobileView);
  if (!show) return null;
  return (
    <div
      className={`absolute z-20 ${
        isMobile ? "inset-x-2 bottom-2 top-16" : "bottom-4 right-4 top-16 w-[340px]"
      }`}
    >
      <button
        onClick={() => setMobileView("canvas")}
        className="absolute -top-3 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs text-white shadow"
        aria-label="プレビューを閉じる"
      >
        ✕
      </button>
      <LinePreview />
    </div>
  );
}

/** 同期状態の表示(段階2でNotion同期の状態を出す) */
function SyncBadge() {
  return (
    <span
      className="hidden items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700 lg:flex"
      title="段階1のため、再読み込みすると内容は元に戻ります"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      保存なし(お試し版)
    </span>
  );
}
