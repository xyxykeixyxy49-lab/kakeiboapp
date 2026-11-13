"use client";

import { useState } from "react";
import { allButtons, useEditor } from "@/store/editor";
import { getKindDef } from "@/lib/templates";
import type { FlowNode, ToolKind } from "@/lib/types";

/**
 * 選んだノードに対する操作ボタン(分岐を追加・次を追加・つなぐ・編集・複製・削除)。
 * PCではノードの上に、スマホでは画面下に固定で出す。
 */
export default function NodeActions({ node, tool, mobile = false }: { node: FlowNode; tool: ToolKind; mobile?: boolean }) {
  const { addBranch, addNext, duplicateNode, deleteNodes, setRightTab, setPendingConnect } = useEditor.getState();
  const [outputsOpen, setOutputsOpen] = useState(false);
  const def = getKindDef(tool, node.kind);
  const branching = def.hasButtons || def.hasCards;
  const canBranch = branching || node.kind === "text";

  // つなげる出口の一覧(「次へ」+各ボタン)
  const outputs = [
    { handleId: "next", label: branching ? "続けて送る(次へ)" : "次へ" },
    ...allButtons(node).map((b) => ({ handleId: `btn:${b.id}`, label: b.label || "ボタン" })),
  ];
  const startConnect = (o: { handleId: string; label: string }) => {
    setOutputsOpen(false);
    setPendingConnect({ nodeId: node.id, handleId: o.handleId, label: o.label });
  };

  const tb = mobile
    ? "flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold"
    : "rounded-md px-2.5 py-1 text-xs font-semibold shadow";
  const tbWhite = mobile ? `${tb} text-slate-700 active:bg-slate-100` : `${tb} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`;
  const tbGreen = mobile ? `${tb} bg-[#06c755] text-white` : `${tb} bg-[#06c755] text-white hover:bg-[#05b34c]`;
  const Icon = ({ c }: { c: string }) => (mobile ? <span className="text-base leading-none">{c}</span> : c === "⑂" ? null : <>{c} </>);

  return (
    <div className={`relative ${mobile ? "grid grid-flow-col auto-cols-fr gap-1" : "flex justify-center gap-1"}`}>
      {canBranch && (
        <button onClick={() => addBranch(node.id)} className={tbGreen}>
          <Icon c="⑂" />
          {mobile ? "分岐追加" : "＋ 分岐を追加"}
        </button>
      )}
      <button onClick={() => addNext(node.id)} className={tbWhite}>
        <Icon c="＋" />
        次を追加
      </button>
      <button
        onClick={() => (outputs.length === 1 ? startConnect(outputs[0]) : setOutputsOpen(!outputsOpen))}
        className={tbWhite}
        title="つなぎ先をタップで選ぶ"
      >
        <Icon c="🔗" />
        つなぐ
      </button>
      <button onClick={() => setRightTab("edit")} className={tbWhite} title="詳細を編集">
        <Icon c="✎" />
        {mobile ? "編集" : ""}
      </button>
      <button onClick={() => duplicateNode(node.id)} className={tbWhite} title="複製">
        <Icon c="⧉" />
        {mobile ? "複製" : ""}
      </button>
      <button onClick={() => deleteNodes([node.id])} className={`${tbWhite} !text-red-500`} title="削除 (Delete)">
        <Icon c="🗑" />
        {mobile ? "削除" : ""}
      </button>

      {outputsOpen && (
        <div
          className={`absolute left-1/2 z-10 w-60 -translate-x-1/2 overflow-hidden rounded-lg bg-white text-xs shadow-lg ring-1 ring-slate-200 ${
            mobile ? "bottom-full mb-2" : "top-full mt-1"
          }`}
        >
          <div className="bg-slate-50 px-3 py-2 font-bold text-slate-500">どこからつなぐ?</div>
          {outputs.map((o) => (
            <button
              key={o.handleId}
              onClick={() => startConnect(o)}
              className="block w-full truncate border-t border-slate-100 px-3 py-3 text-left text-sm hover:bg-emerald-50 md:py-2 md:text-xs"
            >
              {o.handleId === "next" ? "⬇ " : "▶ "}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
