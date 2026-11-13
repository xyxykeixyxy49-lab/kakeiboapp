"use client";

import { memo } from "react";
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowButton, FlowNode, ToolKind } from "@/lib/types";
import { getKindDef } from "@/lib/templates";
import { useEditor } from "@/store/editor";

export type FlowNodeData = {
  node: FlowNode;
  tool: ToolKind;
  commentCount: number;
  readOnly: boolean;
};

export type FlowRFNode = Node<FlowNodeData, "flow">;

function ButtonRow({ b, readOnly, color }: { b: FlowButton; readOnly: boolean; color: string }) {
  return (
    <div className="relative flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-xs">
      <span className="truncate">{b.label || "(未入力)"}</span>
      {!b.targetId && <span className="ml-1 shrink-0 text-[10px] text-slate-300">未接続</span>}
      <Handle
        type="source"
        position={Position.Right}
        id={`btn:${b.id}`}
        isConnectable={!readOnly}
        style={{ right: -15, background: b.targetId ? color : undefined }}
      />
    </div>
  );
}

function FlowNodeCard({ data, selected }: NodeProps<FlowRFNode>) {
  const { node, tool, commentCount, readOnly } = data;
  const def = getKindDef(tool, node.kind);
  const addBranch = useEditor((s) => s.addBranch);
  const addNext = useEditor((s) => s.addNext);
  const duplicateNode = useEditor((s) => s.duplicateNode);
  const deleteNodes = useEditor((s) => s.deleteNodes);
  const setRightTab = useEditor((s) => s.setRightTab);

  const branching = def.hasButtons || def.hasCards;
  const canBranch = branching || node.kind === "text";
  const thumb = node.images[0];
  const bodyText = node.kind === "carousel" ? "" : node.body;

  return (
    <>
      {!readOnly && (
        <NodeToolbar isVisible={selected} position={Position.Top} className="flex gap-1" style={{ zIndex: 1000 }}>
          {canBranch && (
            <button
              onClick={() => addBranch(node.id)}
              className="rounded-md bg-[#06c755] px-2.5 py-1 text-xs font-semibold text-white shadow hover:bg-[#05b34c]"
            >
              ＋ 分岐を追加
            </button>
          )}
          <button
            onClick={() => addNext(node.id)}
            className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
          >
            ＋ 次を追加
          </button>
          <button
            onClick={() => setRightTab("edit")}
            className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
            title="詳細を編集"
          >
            ✎
          </button>
          <button
            onClick={() => duplicateNode(node.id)}
            className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
            title="複製"
          >
            ⧉
          </button>
          <button
            onClick={() => deleteNodes([node.id])}
            className="rounded-md bg-white px-2 py-1 text-xs text-red-500 shadow ring-1 ring-slate-200 hover:bg-red-50"
            title="削除 (Delete)"
          >
            🗑
          </button>
        </NodeToolbar>
      )}

      <div className="w-[250px] overflow-visible rounded-lg bg-white shadow-md ring-1 ring-slate-200 transition-shadow">
        {node.kind !== "trigger" && (
          <Handle type="target" position={Position.Left} isConnectable={!readOnly} style={{ left: -7 }} />
        )}

        <div
          className="flex items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-xs font-semibold text-white"
          style={{ background: def.color }}
        >
          <span>{def.icon}</span>
          <span className="truncate">{def.label}</span>
          {commentCount > 0 && (
            <span
              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] text-white ring-2 ring-white"
              title={`未解決のコメント ${commentCount}件`}
            >
              💬{commentCount}
            </span>
          )}
        </div>

        <div className="space-y-1.5 p-2.5">
          <div className="truncate text-sm font-bold">{node.title || "(名前なし)"}</div>
          {bodyText && <div className="line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">{bodyText}</div>}
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb.url} alt={thumb.name} className="h-20 w-full rounded object-cover" />
          )}

          {def.hasButtons && node.buttons.length > 0 && (
            <div className={node.kind === "richmenu" ? "grid grid-cols-2 gap-1" : "space-y-1"}>
              {node.buttons.map((b) => (
                <ButtonRow key={b.id} b={b} readOnly={readOnly} color={def.color} />
              ))}
            </div>
          )}

          {def.hasCards &&
            node.cards.map((c) => (
              <div key={c.id} className="space-y-1 rounded border border-amber-200 bg-amber-50/50 p-1.5">
                <div className="truncate text-xs font-semibold">🃏 {c.title || "(カード)"}</div>
                {c.buttons.map((b) => (
                  <ButtonRow key={b.id} b={b} readOnly={readOnly} color={def.color} />
                ))}
              </div>
            ))}

          {node.memo && !readOnly && (
            <div className="truncate rounded bg-yellow-50 px-1.5 py-0.5 text-[10px] text-yellow-800">📌 {node.memo}</div>
          )}
        </div>

        {/* 「次へ」:ボタンがある種類は下から、ない種類は右から出す */}
        <Handle
          type="source"
          position={branching ? Position.Bottom : Position.Right}
          id="next"
          isConnectable={!readOnly}
          style={branching ? { bottom: -7 } : { right: -7 }}
          title="続けて送る"
        />
      </div>
    </>
  );
}

export default memo(FlowNodeCard);
