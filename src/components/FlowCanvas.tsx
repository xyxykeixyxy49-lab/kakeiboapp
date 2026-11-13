"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import { useCurrentProject, useEditor } from "@/store/editor";
import { getKindDef, getKindsForTool } from "@/lib/templates";
import FlowNodeCard, { type FlowRFNode } from "./FlowNodeCard";

const nodeTypes = { flow: FlowNodeCard };
const DRAG_TYPE = "application/x-line-node-kind";

export default function FlowCanvas() {
  const project = useCurrentProject()!;
  const allNodes = useEditor((s) => s.nodes);
  const comments = useEditor((s) => s.comments);
  const selectedNodeId = useEditor((s) => s.selectedNodeId);
  const presentation = useEditor((s) => s.presentation);
  const role = useEditor((s) => s.role);
  const { selectNode, moveNodes, deleteNodes, connect, addNode, layoutProject } = useEditor.getState();
  const readOnly = presentation || role !== "admin";

  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => allNodes.filter((n) => n.projectId === project.id), [allNodes, project.id]);

  // ストアの内容 → React Flow 用のノードへ(サイズなどReact Flowが持つ情報は引き継ぐ)
  const [rfNodes, setRfNodes] = useState<FlowRFNode[]>([]);
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const c of comments) if (!c.resolved && !c.parentId) counts[c.nodeId] = (counts[c.nodeId] ?? 0) + 1;
    setRfNodes((prev) => {
      const prevMap = new Map(prev.map((p) => [p.id, p]));
      return nodes.map((n) => {
        const old = prevMap.get(n.id);
        return {
          ...(old ?? {}),
          id: n.id,
          type: "flow" as const,
          position: old?.dragging ? old.position : n.position,
          selected: n.id === selectedNodeId,
          draggable: !readOnly,
          data: { node: n, tool: project.tool, commentCount: counts[n.id] ?? 0, readOnly },
        };
      });
    });
  }, [nodes, comments, selectedNodeId, project.tool, readOnly]);

  // 案件を切り替えたら、流れの始まり側が読める大きさで見えるように
  const fitStart = useCallback(() => {
    const ns = useEditor.getState().nodes.filter((n) => n.projectId === project.id);
    if (!ns.length) return;
    const minX = Math.min(...ns.map((n) => n.position.x));
    const head = ns.filter((n) => n.position.x < minX + 1000);
    fitView({ nodes: head.map((n) => ({ id: n.id })), padding: 0.15, maxZoom: 1, duration: 300 });
  }, [project.id, fitView]);
  useEffect(() => {
    const t = setTimeout(fitStart, 80);
    return () => clearTimeout(t);
  }, [fitStart, presentation]);

  const [selEdge, setSelEdge] = useState<string | null>(null);
  const baseEdges: Edge[] = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const out: Edge[] = [];
    for (const n of nodes) {
      const color = getKindDef(project.tool, n.kind).color;
      const mk = (handle: string, target: string, label?: string, dashed?: boolean): Edge => ({
        id: `${n.id}|${handle}`,
        source: n.id,
        sourceHandle: handle,
        target,
        label,
        type: "default",
        reconnectable: !readOnly,
        style: { stroke: color, strokeWidth: 2, strokeDasharray: dashed ? "6 4" : undefined },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        labelStyle: { fontSize: 11, fill: "#334155" },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
      });
      if (n.nextId && ids.has(n.nextId)) out.push(mk("next", n.nextId, undefined, n.kind === "wait"));
      for (const b of n.buttons) if (b.targetId && ids.has(b.targetId)) out.push(mk(`btn:${b.id}`, b.targetId, b.label));
      for (const c of n.cards)
        for (const b of c.buttons)
          if (b.targetId && ids.has(b.targetId)) out.push(mk(`btn:${b.id}`, b.targetId, `${c.title}:${b.label}`));
    }
    return out;
  }, [nodes, project.tool, readOnly]);
  const edges = useMemo(
    () => baseEdges.map((e) => (e.id === selEdge ? { ...e, selected: true, style: { ...e.style, strokeWidth: 4 } } : e)),
    [baseEdges, selEdge],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowRFNode>[]) => {
      // 削除は onNodesDelete で扱う。選択はストアで管理する
      const local = changes.filter((c) => c.type !== "remove" && c.type !== "select");
      if (local.length) setRfNodes((prev) => applyNodeChanges(local, prev));
    },
    [],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, __: unknown, dragged: FlowRFNode[]) => {
      moveNodes(dragged.map((d) => ({ id: d.id, x: Math.round(d.position.x), y: Math.round(d.position.y) })));
    },
    [moveNodes],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) connect(c.source, c.sourceHandle ?? "next", c.target);
    },
    [connect],
  );

  // 線を何もない場所で離したら、そこに新しいノードを作ってつなぐ
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source") return;
      const pt = "changedTouches" in event ? event.changedTouches[0] : event;
      const pos = screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
      addNode("text", { x: pos.x, y: pos.y - 40 }, { nodeId: state.fromNode.id, handleId: state.fromHandle.id ?? "next" });
    },
    [screenToFlowPosition, addNode],
  );

  // 線のつなぎ替え
  const reconnected = useRef(true);
  const onReconnectStart = useCallback(() => {
    reconnected.current = false;
  }, []);
  const onReconnect = useCallback(
    (old: Edge, c: Connection) => {
      reconnected.current = true;
      if (!c.target || !c.source) return;
      if (old.source !== c.source || old.sourceHandle !== c.sourceHandle) connect(old.source, old.sourceHandle ?? "next", null);
      connect(c.source, c.sourceHandle ?? "next", c.target);
    },
    [connect],
  );
  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      // 何もない所に離したら線を外す
      if (!reconnected.current) connect(edge.source, edge.sourceHandle ?? "next", null);
      reconnected.current = true;
    },
    [connect],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const kind = e.dataTransfer.getData(DRAG_TYPE);
      if (!kind) return;
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(kind, { x: pos.x - 125, y: pos.y - 30 });
    },
    [screenToFlowPosition, addNode],
  );

  const addAtCenter = (kind: string) => {
    const r = wrapper.current?.getBoundingClientRect();
    if (!r) return;
    const pos = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const jitter = (Math.random() - 0.5) * 60;
    addNode(kind, { x: pos.x - 125 + jitter, y: pos.y - 60 + jitter });
  };

  return (
    <div ref={wrapper} className="h-full w-full" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow<FlowRFNode, Edge>
        nodes={rfNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => {
          selectNode(n.id);
          setSelEdge(null);
        }}
        onPaneClick={() => {
          selectNode(null);
          setSelEdge(null);
        }}
        onEdgeClick={(_, e) => {
          setSelEdge(e.id);
          selectNode(null);
        }}
        onNodeDragStart={(_, n) => selectNode(n.id)}
        onNodeDragStop={onNodeDragStop}
        onDelete={({ nodes: ns, edges: es }) => {
          const gone = ns.map((n) => n.id);
          deleteNodes(gone);
          es.filter((e) => !gone.includes(e.source) && !gone.includes(e.target)).forEach((e) =>
            connect(e.source, e.sourceHandle ?? "next", null),
          );
          setSelEdge(null);
        }}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        elementsSelectable
        deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
        <Controls showInteractive={false} />
        {!presentation && <MiniMap pannable zoomable className="!hidden md:!block" nodeColor={(n) => getKindDef(project.tool, (n as FlowRFNode).data.node.kind).color} />}

        {!readOnly && (
          <Panel position="top-left">
            <Palette onAdd={addAtCenter} />
          </Panel>
        )}
        {!readOnly && (
          <Panel position="top-right" className="flex gap-1">
            <button
              onClick={() => fitView({ padding: 0.1, duration: 300 })}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
            >
              ⛶ 全体を表示
            </button>
            <button
              onClick={() => {
                layoutProject();
                setTimeout(fitStart, 50);
              }}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
              title="ノードを自動で並べ直します"
            >
              ⇶ 自動で整列
            </button>
          </Panel>
        )}
        {!readOnly && !nodes.length && (
          <Panel position="bottom-center">
            <div className="rounded bg-white px-3 py-2 text-sm text-slate-500 shadow">左上の部品をクリック、またはドラッグして追加</div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

function Palette({ onAdd }: { onAdd: (kind: string) => void }) {
  const project = useCurrentProject()!;
  const [open, setOpen] = useState(() => useEditor.getState().nodes.filter((n) => n.projectId === project.id).length < 3);
  const kinds = getKindsForTool(project.tool);
  return (
    <div className="w-44 rounded-lg bg-white/95 shadow-md ring-1 ring-slate-200 backdrop-blur">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-slate-600">
        <span>部品を追加</span>
        <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="scroll-thin max-h-[60vh] space-y-0.5 overflow-y-auto px-1.5 pb-1.5">
          {kinds.map((k) => (
            <button
              key={k.key}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, k.key);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onAdd(k.key)}
              title={k.description}
              className="flex w-full cursor-grab items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 active:cursor-grabbing"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px]" style={{ background: `${k.color}22` }}>
                {k.icon}
              </span>
              <span className="truncate">{k.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
