"use client";

import { memo } from "react";
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowButton, FlowNode, ToolKind } from "@/lib/types";
import { getKindDef } from "@/lib/templates";
import { useEditor } from "@/store/editor";
import NodeActions from "./NodeActions";

export type FlowNodeData = {
  node: FlowNode;
  tool: ToolKind;
  commentCount: number;
  readOnly: boolean;
};

export type FlowRFNode = Node<FlowNodeData, "flow">;

function ButtonRow({
  b,
  nodeId,
  readOnly,
  color,
  selected,
}: {
  b: FlowButton;
  nodeId: string;
  readOnly: boolean;
  color: string;
  selected: boolean;
}) {
  const pending = useEditor((s) => s.pendingConnect?.handleId === `btn:${b.id}`);
  return (
    <div
      onClick={(e) => {
        // 選択中のノードのボタンをタップ → つなぎ先を選ぶモードへ
        if (!selected || readOnly || useEditor.getState().pendingConnect) return;
        e.stopPropagation();
        useEditor.getState().setPendingConnect({ nodeId, handleId: `btn:${b.id}`, label: b.label || "ボタン" });
      }}
      className={`relative flex items-center justify-between rounded border px-2 py-1 text-xs ${
        pending ? "border-[#06c755] bg-emerald-50 ring-2 ring-[#06c755]" : "border-slate-200 bg-white"
      } ${selected && !readOnly ? "cursor-pointer hover:border-[#06c755]" : ""}`}
      title={selected && !readOnly ? "タップしてつなぎ先を選ぶ" : undefined}
    >
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
  const branching = def.hasButtons || def.hasCards;
  const thumb = node.images[0];
  const bodyText = node.kind === "carousel" ? "" : node.body;

  return (
    <>
      {!readOnly && (
        // スマホでは画面下のバーに出すので、ここではPCのみ
        <NodeToolbar isVisible={selected} position={Position.Top} style={{ zIndex: 1000 }} className="desktop-only">
          <NodeActions node={node} tool={tool} />
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
                <ButtonRow key={b.id} b={b} nodeId={node.id} readOnly={readOnly} color={def.color} selected={!!selected} />
              ))}
            </div>
          )}

          {def.hasCards &&
            node.cards.map((c) => (
              <div key={c.id} className="space-y-1 rounded border border-amber-200 bg-amber-50/50 p-1.5">
                <div className="truncate text-xs font-semibold">🃏 {c.title || "(カード)"}</div>
                {c.buttons.map((b) => (
                  <ButtonRow key={b.id} b={b} nodeId={node.id} readOnly={readOnly} color={def.color} selected={!!selected} />
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
