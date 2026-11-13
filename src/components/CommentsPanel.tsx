"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor } from "@/store/editor";
import type { FlowComment } from "@/lib/types";
import { Empty } from "./EditPanel";

const NAME_KEY = "line-designer:commenter-name";

function useCommenterName() {
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* 保存できない環境では毎回入力 */
    }
  }, []);
  const save = (v: string) => {
    setName(v);
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {}
  };
  return [name, save] as const;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function CommentsPanel() {
  const selectedNodeId = useEditor((s) => s.selectedNodeId);
  const node = useEditor((s) => s.nodes.find((n) => n.id === s.selectedNodeId));
  const comments = useEditor((s) => s.comments);
  const [name, setName] = useCommenterName();
  const [showResolved, setShowResolved] = useState(false);

  const threads = useMemo(() => {
    const mine = comments.filter((c) => c.nodeId === selectedNodeId);
    return mine
      .filter((c) => !c.parentId)
      .map((root) => ({ root, replies: mine.filter((c) => c.parentId === root.id) }))
      .sort((a, b) => a.root.createdAt.localeCompare(b.root.createdAt));
  }, [comments, selectedNodeId]);

  if (!node || !selectedNodeId) return <Empty text="ノードを選ぶと、そのノードへのコメントを見たり書いたりできます" />;

  const open = threads.filter((t) => !t.root.resolved);
  const resolved = threads.filter((t) => t.root.resolved);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        「<span className="font-semibold text-slate-700">{node.title}</span>」へのコメント
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!open.length && <div className="py-6 text-center text-xs text-slate-400">まだコメントはありません</div>}
        {open.map((t) => (
          <Thread key={t.root.id} root={t.root} replies={t.replies} name={name} />
        ))}
        {resolved.length > 0 && (
          <div>
            <button onClick={() => setShowResolved(!showResolved)} className="text-xs text-slate-500 hover:underline">
              {showResolved ? "▾" : "▸"} 解決済み({resolved.length}件)
            </button>
            {showResolved && (
              <div className="mt-2 space-y-3 opacity-60">
                {resolved.map((t) => (
                  <Thread key={t.root.id} root={t.root} replies={t.replies} name={name} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Composer nodeId={selectedNodeId} name={name} setName={setName} />
    </div>
  );
}

function Thread({ root, replies, name }: { root: FlowComment; replies: FlowComment[]; name: string }) {
  const { toggleResolved, deleteComment, addComment } = useEditor.getState();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim() || !name.trim()) return;
    addComment(root.nodeId, name.trim(), text.trim(), root.id);
    setText("");
    setReplying(false);
  };
  return (
    <div className={`rounded-lg border p-3 ${root.resolved ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50/40"}`}>
      <Message c={root} onDelete={() => deleteComment(root.id)} />
      {replies.map((r) => (
        <div key={r.id} className="mt-2 border-l-2 border-slate-200 pl-3">
          <Message c={r} onDelete={() => deleteComment(r.id)} />
        </div>
      ))}
      {replying ? (
        <div className="mt-2 space-y-1">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            className="w-full rounded border border-slate-200 p-1.5 text-sm outline-none focus:border-[#06c755]"
            placeholder={name ? "返信を入力" : "先に下の欄でお名前を入力してください"}
          />
          <div className="flex justify-end gap-1">
            <button onClick={() => setReplying(false)} className="px-2 py-1 text-xs text-slate-500">
              やめる
            </button>
            <button onClick={send} disabled={!name.trim()} className="rounded bg-[#06c755] px-2 py-1 text-xs text-white disabled:opacity-40">
              返信
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-3 text-xs">
          <button onClick={() => setReplying(true)} className="text-slate-500 hover:text-slate-800">
            ↩ 返信
          </button>
          <button onClick={() => toggleResolved(root.id)} className="text-emerald-600 hover:text-emerald-800">
            {root.resolved ? "↺ 未解決に戻す" : "✓ 解決済みにする"}
          </button>
        </div>
      )}
    </div>
  );
}

function Message({ c, onDelete }: { c: FlowComment; onDelete: () => void }) {
  return (
    <div className="group">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-bold">{c.author}</span>
        <span className="text-slate-400">{fmt(c.createdAt)}</span>
        <button onClick={onDelete} className="ml-auto hidden text-slate-300 hover:text-red-500 group-hover:inline" title="削除">
          ✕
        </button>
      </div>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</div>
    </div>
  );
}

function Composer({ nodeId, name, setName }: { nodeId: string; name: string; setName: (v: string) => void }) {
  const addComment = useEditor((s) => s.addComment);
  const [text, setText] = useState("");
  const [editingName, setEditingName] = useState(false);
  const needName = !name.trim() || editingName;
  const send = () => {
    if (!text.trim() || !name.trim()) return;
    addComment(nodeId, name.trim(), text.trim());
    setText("");
  };
  return (
    <div className="space-y-2 border-t border-slate-200 bg-white p-3">
      {needName ? (
        <div className="flex items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && setEditingName(false)}
            placeholder="お名前(次回から自動で入ります)"
            className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-[#06c755]"
          />
        </div>
      ) : (
        <div className="text-xs text-slate-500">
          投稿者:<span className="font-semibold text-slate-700">{name}</span>{" "}
          <button onClick={() => setEditingName(true)} className="text-slate-400 hover:underline">
            変更
          </button>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
        }}
        placeholder="コメントを入力(Ctrl+Enterで送信)"
        className="min-h-16 w-full rounded border border-slate-200 p-2 text-sm outline-none focus:border-[#06c755]"
      />
      <button
        onClick={send}
        disabled={!text.trim() || !name.trim()}
        className="w-full rounded-md bg-[#06c755] py-1.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        コメントする
      </button>
    </div>
  );
}
