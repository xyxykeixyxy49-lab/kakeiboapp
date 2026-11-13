"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type { FlowButton, FlowComment, FlowImage, FlowNode, Project, ToolKind } from "@/lib/types";
import { getKindDef } from "@/lib/templates";
import { autoLayout } from "@/lib/layout";

export type RightTab = "preview" | "edit" | "comments";
export type Role = "admin" | "viewer";
/** スマホでどの画面を出しているか */
export type MobileView = "canvas" | RightTab;
/** タップでつなぐ途中の情報 */
export interface PendingConnect {
  nodeId: string;
  handleId: string;
  label: string;
}

interface Snapshot {
  projects: Project[];
  nodes: FlowNode[];
}

/** 保存先 */
export type DataMode = "loading" | "local" | "notion";
/** 同期の状態(画面右上に表示) */
export type SyncStatus = "saved" | "syncing" | "error" | "offline" | "local";

interface EditorState {
  role: Role;
  mode: DataMode;
  needLogin: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  pendingCount: number;
  loadingProject: boolean;
  projects: Project[];
  nodes: FlowNode[];
  comments: FlowComment[];
  currentProjectId: string | null;
  selectedNodeId: string | null;
  rightTab: RightTab;
  leftCollapsed: boolean;
  presentation: boolean;
  /** 構成図だけを全画面表示 */
  canvasFull: boolean;
  mobileView: MobileView;
  projectDrawer: boolean;
  pendingConnect: PendingConnect | null;
  past: Snapshot[];
  future: Snapshot[];

  // 画面
  setRightTab: (tab: RightTab) => void;
  toggleLeft: () => void;
  setPresentation: (on: boolean) => void;
  selectNode: (id: string | null) => void;
  setCanvasFull: (on: boolean) => void;
  setMobileView: (v: MobileView) => void;
  setProjectDrawer: (on: boolean) => void;
  setPendingConnect: (p: PendingConnect | null) => void;

  // 案件
  selectProject: (id: string) => void;
  insertProject: (p: Project, nodes: FlowNode[]) => void;
  createProject: () => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // ノード
  addNode: (kind: string, position: { x: number; y: number }, from?: { nodeId: string; handleId: string }) => string;
  updateNode: (id: string, patch: Partial<FlowNode>) => void;
  changeKind: (id: string, kind: string) => void;
  moveNodes: (moves: { id: string; x: number; y: number }[]) => void;
  deleteNodes: (ids: string[]) => void;
  duplicateNode: (id: string) => void;
  connect: (sourceId: string, handleId: string, targetId: string | null) => void;
  addBranch: (nodeId: string) => void;
  addNext: (nodeId: string) => void;
  addImages: (nodeId: string, images: FlowImage[]) => void;
  layoutProject: () => void;

  // コメント
  addComment: (nodeId: string, author: string, body: string, parentId?: string | null) => void;
  toggleResolved: (commentId: string) => void;
  deleteComment: (commentId: string) => void;

  // 元に戻す
  undo: () => void;
  redo: () => void;
}

const now = () => new Date().toISOString();

/** ノードが持つすべてのボタン(通常ボタン+カルーセル内ボタン) */
export function allButtons(node: FlowNode): FlowButton[] {
  return [...node.buttons, ...node.cards.flatMap((c) => c.buttons)];
}

/** handleId: "next" または "btn:<ボタンID>" */
function setTarget(node: FlowNode, handleId: string, targetId: string | null): FlowNode {
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

export const useEditor = create<EditorState>((set, get) => {
  /** 構成を変える操作の前に呼んで、元に戻せるようにする */
  // 文字入力のように連続する同じ操作は、1回分の「元に戻す」にまとめる
  let lastKey: string | null = null;
  let lastAt = 0;
  const commit = (fn: (s: EditorState) => Partial<EditorState>, key?: string) =>
    set((s) => {
      const snap: Snapshot = { projects: s.projects, nodes: s.nodes };
      const merge = key && key === lastKey && Date.now() - lastAt < 1500;
      lastKey = key ?? null;
      lastAt = Date.now();
      const next = fn(s);
      const touched = s.currentProjectId;
      const projects = (next.projects ?? s.projects).map((p) => (p.id === touched ? { ...p, updatedAt: now() } : p));
      return { ...next, projects, past: merge ? s.past : [...s.past.slice(-49), snap], future: [] };
    });

  const project = () => get().projects.find((p) => p.id === get().currentProjectId);

  return {
    role: "admin",
    mode: "loading",
    needLogin: false,
    syncStatus: "saved",
    syncError: null,
    pendingCount: 0,
    loadingProject: false,
    // 起動時に sync.ts がブラウザ内の保存データ/Notionから読み込む
    projects: [],
    nodes: [],
    comments: [],
    currentProjectId: null,
    selectedNodeId: null,
    rightTab: "preview",
    leftCollapsed: false,
    presentation: false,
    canvasFull: false,
    mobileView: "canvas",
    projectDrawer: false,
    pendingConnect: null,
    past: [],
    future: [],

    setRightTab: (rightTab) => set({ rightTab, mobileView: rightTab }),
    setCanvasFull: (canvasFull) => set({ canvasFull }),
    setMobileView: (mobileView) => set(mobileView === "canvas" ? { mobileView } : { mobileView, rightTab: mobileView }),
    setProjectDrawer: (projectDrawer) => set({ projectDrawer }),
    setPendingConnect: (pendingConnect) => set({ pendingConnect }),
    toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
    setPresentation: (presentation) =>
      set({
        presentation,
        rightTab: presentation ? "preview" : get().rightTab,
        mobileView: presentation ? "canvas" : get().mobileView,
        pendingConnect: null,
      }),
    selectNode: (selectedNodeId) => set({ selectedNodeId }),

    selectProject: (id) =>
      set({ currentProjectId: id, selectedNodeId: null, past: [], future: [], projectDrawer: false, mobileView: "canvas", pendingConnect: null }),
    insertProject: (p, nodes) =>
      set((s) => ({
        projects: [p, ...s.projects],
        nodes: [...s.nodes, ...nodes],
        currentProjectId: p.id,
        selectedNodeId: null,
        past: [],
        future: [],
        projectDrawer: false,
        mobileView: "canvas",
      })),
    createProject: () => {
      const id = nanoid(10);
      const p: Project = {
        id,
        name: "新しい案件",
        clientName: "",
        tool: "lstep",
        status: "draft",
        shareToken: null,
        updatedAt: now(),
      };
      const start = newNode(id, p.tool, "trigger", { x: 0, y: 0 });
      start.title = "友だち追加";
      start.body = "友だち追加されたとき";
      set((s) => ({
        projects: [p, ...s.projects],
        nodes: [...s.nodes, start],
        currentProjectId: id,
        selectedNodeId: null,
        past: [],
        future: [],
        projectDrawer: false,
        mobileView: "canvas",
      }));
    },
    updateProject: (id, patch) =>
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)) })),
    deleteProject: (id) =>
      set((s) => {
        const projects = s.projects.filter((p) => p.id !== id);
        return {
          projects,
          nodes: s.nodes.filter((n) => n.projectId !== id),
          currentProjectId: s.currentProjectId === id ? (projects[0]?.id ?? null) : s.currentProjectId,
          selectedNodeId: null,
          past: [],
          future: [],
        };
      }),

    addNode: (kind, position, from) => {
      const p = project();
      if (!p) return "";
      const node = newNode(p.id, p.tool, kind, position);
      commit((s) => ({
        nodes: [
          ...s.nodes.map((n) => (from && n.id === from.nodeId ? setTarget(n, from.handleId, node.id) : n)),
          node,
        ],
      }));
      set({ selectedNodeId: node.id });
      return node.id;
    },
    updateNode: (id, patch) =>
      commit(
        (s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }),
        `edit:${id}:${Object.keys(patch).sort().join(",")}`,
      ),
    changeKind: (id, kind) => {
      const p = project();
      if (!p) return;
      const def = getKindDef(p.tool, kind);
      commit((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== id) return n;
          const fresh = newNode(p.id, p.tool, kind, n.position);
          return {
            ...n,
            kind,
            // ボタンやカードは引き継げるなら引き継ぐ
            buttons: def.hasButtons ? (n.buttons.length ? n.buttons : fresh.buttons) : [],
            cards: def.hasCards ? (n.cards.length ? n.cards : fresh.cards) : [],
          };
        }),
      }));
    },
    moveNodes: (moves) =>
      commit((s) => ({
        nodes: s.nodes.map((n) => {
          const m = moves.find((mv) => mv.id === n.id);
          return m ? { ...n, position: { x: m.x, y: m.y } } : n;
        }),
      })),
    deleteNodes: (ids) => {
      if (!ids.length) return;
      const clear = (b: FlowButton) => (b.targetId && ids.includes(b.targetId) ? { ...b, targetId: null } : b);
      commit((s) => ({
        nodes: s.nodes
          .filter((n) => !ids.includes(n.id))
          .map((n) => ({
            ...n,
            nextId: n.nextId && ids.includes(n.nextId) ? null : n.nextId,
            buttons: n.buttons.map(clear),
            cards: n.cards.map((c) => ({ ...c, buttons: c.buttons.map(clear) })),
          })),
      }));
      set((s) => ({
        selectedNodeId: s.selectedNodeId && ids.includes(s.selectedNodeId) ? null : s.selectedNodeId,
        comments: s.comments.filter((c) => !ids.includes(c.nodeId)),
      }));
    },
    duplicateNode: (id) => {
      const src = get().nodes.find((n) => n.id === id);
      if (!src) return;
      const reBtn = (b: FlowButton) => ({ ...b, id: nanoid(8), targetId: null });
      const copy: FlowNode = {
        ...src,
        id: nanoid(10),
        title: `${src.title}(コピー)`,
        nextId: null,
        buttons: src.buttons.map(reBtn),
        cards: src.cards.map((c) => ({ ...c, id: nanoid(8), buttons: c.buttons.map(reBtn) })),
        position: { x: src.position.x + 40, y: src.position.y + 40 },
      };
      commit((s) => ({ nodes: [...s.nodes, copy] }));
      set({ selectedNodeId: copy.id });
    },
    connect: (sourceId, handleId, targetId) =>
      commit((s) => ({ nodes: s.nodes.map((n) => (n.id === sourceId ? setTarget(n, handleId, targetId) : n)) })),

    addBranch: (nodeId) => {
      const p = project();
      const src = get().nodes.find((n) => n.id === nodeId);
      if (!p || !src) return;
      let def = getKindDef(p.tool, src.kind);
      let working = src;
      // テキストに分岐を足すときは、ボタン付きメッセージに変える
      if (!def.hasButtons && !def.hasCards) {
        if (src.kind !== "text") return get().addNext(nodeId);
        def = getKindDef(p.tool, "buttons");
        working = { ...src, kind: "buttons", buttons: [] };
      }
      const childCount = allButtons(working).filter((b) => b.targetId).length + (working.nextId ? 1 : 0);
      const child = newNode(p.id, p.tool, "text", {
        x: src.position.x + 340,
        y: src.position.y + childCount * 170,
      });
      const btn: FlowButton = {
        id: nanoid(8),
        label: `${def.defaultButtonLabel ?? "選択肢"}${allButtons(working).length + 1}`,
        targetId: child.id,
      };
      if (def.hasCards) {
        working = {
          ...working,
          cards: [
            ...working.cards,
            { id: nanoid(8), title: `カード${working.cards.length + 1}`, text: "", imageId: null, buttons: [{ ...btn, label: "詳しく見る" }] },
          ],
        };
      } else {
        // 空いているボタンがあれば先にそれを使う
        const empty = working.buttons.find((b) => !b.targetId);
        working = empty
          ? { ...working, buttons: working.buttons.map((b) => (b.id === empty.id ? { ...b, targetId: child.id } : b)) }
          : { ...working, buttons: [...working.buttons, btn] };
      }
      const chosen = allButtons(working).find((b) => b.targetId === child.id);
      child.title = chosen ? `「${chosen.label}」を選んだ時` : "テキスト";
      commit((s) => ({ nodes: [...s.nodes.map((n) => (n.id === nodeId ? working : n)), child] }));
      set({ selectedNodeId: child.id });
    },
    addNext: (nodeId) => {
      const src = get().nodes.find((n) => n.id === nodeId);
      const p = project();
      if (!src || !p) return;
      const def = getKindDef(p.tool, src.kind);
      const below = def.hasButtons || def.hasCards;
      const child = newNode(p.id, p.tool, "text", {
        x: below ? src.position.x : src.position.x + 340,
        y: below ? src.position.y + 320 : src.position.y,
      });
      const oldNext = src.nextId;
      // 間に差し込む(元の次の遷移先は新しいノードの次へ)
      child.nextId = oldNext;
      commit((s) => ({ nodes: [...s.nodes.map((n) => (n.id === nodeId ? { ...n, nextId: child.id } : n)), child] }));
      set({ selectedNodeId: child.id });
    },
    addImages: (nodeId, images) =>
      commit((s) => ({ nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, images: [...n.images, ...images] } : n)) })),
    layoutProject: () => {
      const id = get().currentProjectId;
      commit((s) => {
        const mine = s.nodes.filter((n) => n.projectId === id);
        const pos = autoLayout(mine);
        return { nodes: s.nodes.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)) };
      });
    },

    addComment: (nodeId, author, body, parentId = null) =>
      set((s) => ({
        comments: [...s.comments, { id: nanoid(10), nodeId, author, body, parentId, resolved: false, createdAt: now() }],
      })),
    toggleResolved: (commentId) =>
      set((s) => ({ comments: s.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)) })),
    deleteComment: (commentId) =>
      set((s) => ({ comments: s.comments.filter((c) => c.id !== commentId && c.parentId !== commentId) })),

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return {};
        return {
          projects: prev.projects,
          nodes: prev.nodes,
          past: s.past.slice(0, -1),
          future: [{ projects: s.projects, nodes: s.nodes }, ...s.future],
        };
      }),
    redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next) return {};
        return {
          projects: next.projects,
          nodes: next.nodes,
          past: [...s.past, { projects: s.projects, nodes: s.nodes }],
          future: s.future.slice(1),
        };
      }),
  };
});

/** 今の案件 */
export const useCurrentProject = () =>
  useEditor((s) => s.projects.find((p) => p.id === s.currentProjectId) ?? null);
