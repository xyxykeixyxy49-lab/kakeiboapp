"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentProject, useEditor } from "@/store/editor";
import type { FlowButton, FlowNode } from "@/lib/types";
import { getKindDef } from "@/lib/templates";

type Entry = { t: "bot"; nodeId: string; key: string } | { t: "user"; text: string; key: string } | { t: "note"; text: string; key: string };

let seq = 0;
const k = () => `e${++seq}`;

/** あるノードから「次へ」でつながっているノードを、続けて送られる分だけたどる */
function chainFrom(startId: string, byId: Map<string, FlowNode>): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  let cur: string | null = startId;
  while (cur && byId.has(cur) && !seen.has(cur) && out.length < 12) {
    seen.add(cur);
    out.push({ t: "bot", nodeId: cur, key: k() });
    cur = byId.get(cur)!.nextId;
  }
  return out;
}

export default function LinePreview({ large = false }: { large?: boolean }) {
  const project = useCurrentProject()!;
  const allNodes = useEditor((s) => s.nodes);
  const selectedNodeId = useEditor((s) => s.selectedNodeId);
  const selectNode = useEditor((s) => s.selectNode);

  const nodes = useMemo(() => allNodes.filter((n) => n.projectId === project.id), [allNodes, project.id]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const richMenu = nodes.find((n) => n.kind === "richmenu");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [menuOpen, setMenuOpen] = useState(true);
  const fromPreview = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const startId = selectedNodeId ?? nodes.find((n) => n.kind === "trigger")?.id ?? nodes[0]?.id ?? null;

  // キャンバスで選んだノードが変わったら、そこからのトークを表示し直す
  useEffect(() => {
    if (fromPreview.current) {
      fromPreview.current = false;
      return;
    }
    setEntries(startId ? chainFrom(startId, byId) : []);
    if (startId && byId.get(startId)?.kind === "richmenu") setMenuOpen(true);
    // byId は内容編集のたびに変わるが、そのたびにトーク履歴を消さないよう startId だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startId, project.id]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const tap = (b: Pick<FlowButton, "label" | "targetId">) => {
    const add: Entry[] = [{ t: "user", text: b.label, key: k() }];
    if (b.targetId && byId.has(b.targetId)) {
      add.push(...chainFrom(b.targetId, byId));
      if (useEditor.getState().selectedNodeId !== b.targetId) {
        fromPreview.current = true;
        selectNode(b.targetId);
      }
    } else {
      add.push({ t: "note", text: "このボタンの遷移先はまだ設定されていません", key: k() });
    }
    setEntries((prev) => [...prev, ...add]);
  };

  const accountName = project.clientName.replace(/\s*様$/, "") || project.name;

  return (
    <div className={`mx-auto flex h-full w-full flex-col overflow-hidden rounded-[28px] border-[6px] border-slate-800 bg-slate-800 shadow-xl ${large ? "max-w-[420px]" : "max-w-[360px]"}`}>
      {/* ヘッダー */}
      <div className="flex items-center gap-2 bg-[#2b3a55] px-3 py-2.5 text-white">
        <span className="text-lg leading-none">‹</span>
        <span className="flex-1 truncate text-sm font-semibold">{accountName}</span>
        <button
          onClick={() => setEntries(startId ? chainFrom(startId, byId) : [])}
          className="rounded px-1.5 py-0.5 text-[10px] text-white/70 ring-1 ring-white/30 hover:bg-white/10"
          title="表示をリセット"
        >
          ↺ 最初から
        </button>
      </div>

      {/* トーク */}
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4" style={{ background: "var(--talk-bg)" }}>
        {!entries.length && <div className="pt-10 text-center text-xs text-white/80">ノードを選ぶと、ここにトーク画面が表示されます</div>}
        {entries.map((e) => {
          if (e.t === "user")
            return (
              <div key={e.key} className="flex justify-end">
                <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#8de055] px-3 py-2 text-sm shadow-sm">{e.text}</div>
              </div>
            );
          if (e.t === "note") return <Pill key={e.key} text={e.text} dashed />;
          const node = byId.get(e.nodeId);
          if (!node) return null;
          return <BotMessage key={e.key} node={node} accountName={accountName} onTap={tap} />;
        })}
      </div>

      {/* リッチメニュー */}
      {richMenu && (
        <div className="bg-white">
          {menuOpen && (
            <div className="grid grid-cols-3 gap-px bg-slate-200">
              {richMenu.images[0] ? (
                <div className="relative col-span-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={richMenu.images[0].url} alt="" className="w-full" />
                  <div className="absolute inset-0 grid grid-cols-3">
                    {richMenu.buttons.map((b) => (
                      <button key={b.id} onClick={() => tap(b)} className="hover:bg-white/20" title={b.label} />
                    ))}
                  </div>
                </div>
              ) : (
                richMenu.buttons.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => tap(b)}
                    className="flex h-16 items-center justify-center bg-gradient-to-br from-violet-50 to-white px-1 text-center text-xs font-semibold text-violet-800 hover:from-violet-100"
                  >
                    {b.label}
                  </button>
                ))
              )}
            </div>
          )}
          <button onClick={() => setMenuOpen(!menuOpen)} className="w-full border-t border-slate-200 py-1.5 text-xs text-slate-600">
            {richMenu.title || "メニュー"} {menuOpen ? "▾" : "▴"}
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 bg-white px-3 py-2 text-slate-300">
        <span>＋</span>
        <div className="h-7 flex-1 rounded-full bg-slate-100" />
        <span>☺</span>
      </div>
    </div>
  );
}

function Pill({ text, dashed }: { text: string; dashed?: boolean }) {
  return (
    <div className="flex justify-center">
      <div
        className={`max-w-[90%] whitespace-pre-wrap rounded-full px-3 py-1 text-center text-[11px] ${
          dashed ? "border border-dashed border-white/80 text-white" : "bg-black/25 text-white"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#06c755] text-xs font-bold text-white">
      {name.slice(0, 1)}
    </div>
  );
}

function BotMessage({ node, accountName, onTap }: { node: FlowNode; accountName: string; onTap: (b: FlowButton) => void }) {
  const project = useCurrentProject()!;
  const def = getKindDef(project.tool, node.kind);
  const img = (id: string | null) => node.images.find((i) => i.id === id);
  const lines = node.body.split("\n").filter(Boolean);

  switch (def.preview) {
    case "trigger":
      return <Pill text={`🚩 ${node.title}${node.body ? `\n${node.body}` : ""}`} />;
    case "wait":
      return <Pill text={`⏱ ${node.body || node.title}`} />;
    case "system":
      return (
        <Pill
          dashed
          text={`${def.icon} ${def.label}:${lines.join("、") || node.title}\n(お客様には表示されません)`}
        />
      );
    case "condition":
      return (
        <div className="space-y-1.5">
          <Pill dashed text={`🔀 ${def.label}:${node.body || node.title}`} />
          <div className="flex flex-wrap justify-center gap-1.5">
            {node.buttons.map((b) => (
              <button
                key={b.id}
                onClick={() => onTap(b)}
                className="rounded-full border border-dashed border-white bg-white/20 px-2.5 py-1 text-[11px] text-white hover:bg-white/40"
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      );
    case "richmenu":
      return <Pill text={`📱 リッチメニュー「${node.title}」を表示`} />;
  }

  let content: React.ReactNode;
  if (def.preview === "text") {
    content = (
      <>
        {node.body && (
          <div className="max-w-[230px] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">{node.body}</div>
        )}
        {node.images.map((i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i.id} src={i.url} alt={i.name} className="mt-1.5 max-w-[200px] rounded-xl shadow-sm" />
        ))}
        {!node.body && !node.images.length && (
          <div className="rounded-2xl rounded-tl-sm bg-white/70 px-3 py-2 text-sm text-slate-400">(本文が未入力です)</div>
        )}
      </>
    );
  } else if (def.preview === "image") {
    content = node.images.length ? (
      node.images.map((i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i.id} src={i.url} alt={i.name} className="mb-1.5 max-w-[200px] rounded-xl shadow-sm" />
      ))
    ) : (
      <div className="flex h-32 w-48 items-center justify-center rounded-xl bg-white/70 text-xs text-slate-400">🖼️ 画像(未設定)</div>
    );
  } else if (def.preview === "buttons") {
    content = (
      <div className="w-[230px] overflow-hidden rounded-2xl bg-white shadow-sm">
        {node.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={node.images[0].url} alt="" className="aspect-[1.51] w-full object-cover" />
        )}
        <div className="whitespace-pre-wrap px-3 py-3 text-sm">{node.body || <span className="text-slate-400">(本文が未入力です)</span>}</div>
        {node.buttons.map((b) => (
          <ActionButton key={b.id} b={b} onTap={onTap} />
        ))}
      </div>
    );
  } else if (def.preview === "carousel") {
    content = (
      <div className="scroll-thin -mr-3 flex max-w-[calc(100%+12px)] gap-2 overflow-x-auto pb-1 pr-3">
        {node.cards.map((c) => {
          const ci = img(c.imageId);
          return (
            <div key={c.id} className="w-[190px] shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm">
              {ci ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ci.url} alt="" className="aspect-[1.51] w-full object-cover" />
              ) : (
                <div className="flex aspect-[1.51] items-center justify-center bg-amber-50 text-2xl">🃏</div>
              )}
              <div className="px-3 pt-2 text-sm font-bold">{c.title}</div>
              <div className="whitespace-pre-wrap px-3 pb-2 text-xs text-slate-600">{c.text}</div>
              {c.buttons.map((b) => (
                <ActionButton key={b.id} b={b} onTap={onTap} />
              ))}
            </div>
          );
        })}
      </div>
    );
  } else if (def.preview === "form") {
    content = (
      <div className="w-[230px] overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="bg-pink-50 px-3 py-2 text-sm font-bold text-pink-700">📝 {node.title}</div>
        <ul className="space-y-1.5 px-3 py-2">
          {(lines.length ? lines : ["(質問項目が未入力です)"]).map((l, i) => (
            <li key={i} className="text-xs">
              <div className="text-slate-600">{l}</div>
              <div className="mt-0.5 h-5 rounded border border-slate-200 bg-slate-50" />
            </li>
          ))}
        </ul>
        <ActionButton b={{ id: "submit", label: "回答する", targetId: node.nextId }} onTap={() => {}} disabled />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Avatar name={accountName} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] text-white/90">{accountName}</div>
        {content}
        {node.kind === "quickreply" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {node.buttons.map((b) => (
              <button
                key={b.id}
                onClick={() => onTap(b)}
                className="rounded-full border border-[#06c755] bg-white px-3 py-1 text-xs font-semibold text-[#06c755] hover:bg-emerald-50"
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ b, onTap, disabled }: { b: FlowButton; onTap: (b: FlowButton) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onTap(b)}
      className={`block w-full border-t border-slate-100 py-2.5 text-center text-sm font-semibold text-[#2f6bd8] ${
        disabled ? "cursor-default" : "hover:bg-slate-50"
      }`}
    >
      {b.label || "(未入力)"}
    </button>
  );
}
