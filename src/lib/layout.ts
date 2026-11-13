import dagre from "@dagrejs/dagre";
import type { FlowNode } from "./types";

/** ノードの高さのおおよその見積もり(整列用) */
function estimateHeight(n: FlowNode): number {
  const btns = n.buttons.length + n.cards.reduce((a, c) => a + 1 + c.buttons.length, 0);
  return 110 + btns * 30 + (n.images.length ? 90 : 0);
}

/** 「整列」ボタン:左から右へ流れる形に自動で並べ直す */
export function autoLayout(nodes: FlowNode[]): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 110 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: 250, height: estimateHeight(n) });
  for (const n of nodes) {
    const targets = [n.nextId, ...n.buttons.map((b) => b.targetId), ...n.cards.flatMap((c) => c.buttons.map((b) => b.targetId))];
    for (const t of targets) if (t && ids.has(t)) g.setEdge(n.id, t);
  }
  dagre.layout(g);
  const out: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    out[n.id] = { x: Math.round(p.x - 125), y: Math.round(p.y - estimateHeight(n) / 2) };
  }
  return out;
}
