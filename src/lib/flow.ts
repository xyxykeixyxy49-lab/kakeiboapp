import { nanoid } from "nanoid";
import type { FlowButton, FlowNode, ToolKind } from "./types";
import { getKindDef } from "./templates";

/**
 * ノードを扱う共通の処理(画面とMCPの両方で使う)
 */

/** ノードが持つすべてのボタン(通常ボタン+カルーセル内ボタン) */
export function allButtons(node: FlowNode): FlowButton[] {
  return [...node.buttons, ...node.cards.flatMap((c) => c.buttons)];
}

/** handleId: "next" または "btn:<ボタンID>" */
export function setTarget(node: FlowNode, handleId: string, targetId: string | null): FlowNode {
  if (handleId === "next") return { ...node, nextId: targetId };
  const btnId = handleId.replace(/^btn:/, "");
  const patchBtn = (b: FlowButton) => (b.id === btnId ? { ...b, targetId } : b);
  return {
    ...node,
    buttons: node.buttons.map(patchBtn),
    cards: node.cards.map((c) => ({ ...c, buttons: c.buttons.map(patchBtn) })),
  };
}

export function newNode(projectId: string, tool: ToolKind, kind: string, position: { x: number; y: number }): FlowNode {
  const def = getKindDef(tool, kind);
  const node: FlowNode = {
    id: nanoid(10),
    projectId,
    kind,
    title: def.label,
    body: "",
    buttons: [],
    cards: [],
    nextId: null,
    memo: "",
    images: [],
    position,
  };
  if (def.hasButtons) {
    node.buttons = [1, 2].map((i) => ({ id: nanoid(8), label: `${def.defaultButtonLabel ?? "ボタン"}${i}`, targetId: null }));
  }
  if (def.hasCards) {
    node.cards = [1, 2].map((i) => ({
      id: nanoid(8),
      title: `カード${i}`,
      text: "",
      imageId: null,
      buttons: [{ id: nanoid(8), label: "詳しく見る", targetId: null }],
    }));
  }
  return node;
}

