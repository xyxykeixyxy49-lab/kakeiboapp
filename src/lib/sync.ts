"use client";

import { get as idbGet, set as idbSet } from "idb-keyval";
import { nanoid } from "nanoid";
import { useEditor, newNode } from "@/store/editor";
import { cloneNodes, sampleComments, sampleNodes, sampleProjects } from "./sample";
import type { FlowComment, FlowNode, Project } from "./types";

/**
 * 保存と同期のしくみ
 *
 * 1. 編集するとまずブラウザ内(IndexedDB)に自動保存 → 再読み込みしても消えない
 * 2. 変更のあったノード・案件を覚えておき、数秒ごとにまとめてNotionへ送る
 * 3. 送れなかった分は残しておき、次の回に再送する(オフラインでもOK)
 */

const SYNC_INTERVAL = 2500;

type Dirty = {
  /** projectId → (nodeId → 変更回数) */
  nodes: Record<string, Record<string, number>>;
  /** projectId → 消したnodeIdの一覧 */
  deletes: Record<string, string[]>;
  /** projectId → 変更回数(案件名などの変更) */
  projects: Record<string, number>;
};

interface Cache {
  projects: Project[];
  nodes: FlowNode[];
  comments: FlowComment[];
  currentProjectId: string | null;
  dirty: Dirty;
}

let dirty: Dirty = { nodes: {}, deletes: {}, projects: {} };
let applyingRemote = false;
let started = false;
let syncing = false;
let cacheKey = "";
const loadedProjects = new Set<string>();

const st = () => useEditor.getState();

/** ストアに「サーバー側から来たデータ」を入れる(変更扱いにしない) */
type State = ReturnType<typeof useEditor.getState>;
function applyRemote(patch: Partial<State> | ((s: State) => Partial<State>)) {
  applyingRemote = true;
  try {
    useEditor.setState(patch);
  } finally {
    applyingRemote = false;
  }
}

function pendingCount() {
  return (
    Object.values(dirty.nodes).reduce((a, m) => a + Object.keys(m).length, 0) +
    Object.values(dirty.deletes).reduce((a, l) => a + l.length, 0) +
    Object.keys(dirty.projects).length
  );
}

function refreshStatus(extra?: { error?: string | null }) {
  const s = st();
  const count = pendingCount();
  let syncStatus = s.syncStatus;
  if (s.mode === "local") syncStatus = "local";
  else if (typeof navigator !== "undefined" && !navigator.onLine && count) syncStatus = "offline";
  else if (extra?.error) syncStatus = "error";
  else if (syncing) syncStatus = "syncing";
  else if (count) syncStatus = s.syncStatus === "error" ? "error" : "syncing";
  else syncStatus = "saved";
  useEditor.setState({
    syncStatus,
    pendingCount: count,
    ...(extra && "error" in extra ? { syncError: extra.error ?? null } : {}),
  });
}

// ---- 変更の検出 -------------------------------------------------------------

const projectKey = (p: Project) => `${p.name}\u0000${p.clientName}\u0000${p.tool}\u0000${p.status}`;

function watchChanges() {
  useEditor.subscribe((next, prev) => {
    if (next.nodes === prev.nodes && next.projects === prev.projects && next.comments === prev.comments) return;
    if (!applyingRemote && next.mode === "notion") {
      if (next.nodes !== prev.nodes) {
        const before = new Map(prev.nodes.map((n) => [n.id, n]));
        const after = new Set<string>();
        for (const n of next.nodes) {
          after.add(n.id);
          if (before.get(n.id) !== n) {
            const m = (dirty.nodes[n.projectId] ??= {});
            m[n.id] = (m[n.id] ?? 0) + 1;
          }
        }
        for (const [id, n] of before) {
          if (after.has(id)) continue;
          if (dirty.nodes[n.projectId]) delete dirty.nodes[n.projectId][id];
          (dirty.deletes[n.projectId] ??= []).push(id);
        }
      }
      if (next.projects !== prev.projects) {
        const before = new Map(prev.projects.map((p) => [p.id, p]));
        for (const p of next.projects) {
          const old = before.get(p.id);
          if (old && projectKey(old) !== projectKey(p)) dirty.projects[p.id] = (dirty.projects[p.id] ?? 0) + 1;
        }
      }
      refreshStatus();
    }
    scheduleCache();
  });
}

// ---- ブラウザ内への保存 -----------------------------------------------------

let cacheTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCache() {
  if (!cacheKey) return;
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(writeCache, 600);
}
async function writeCache() {
  const s = st();
  const data: Cache = {
    projects: s.projects,
    nodes: s.nodes,
    comments: s.comments,
    currentProjectId: s.currentProjectId,
    dirty,
  };
  try {
    await idbSet(cacheKey, data);
  } catch (e) {
    console.warn("ブラウザ内への保存に失敗", e);
  }
}
async function readCache(): Promise<Cache | null> {
  try {
    return ((await idbGet(cacheKey)) as Cache | undefined) ?? null;
  } catch {
    return null;
  }
}

// ---- 通信 -------------------------------------------------------------------

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (path !== "/api/login") useEditor.setState({ needLogin: true });
    throw new Error(body.error ?? "ログインが必要です");
  }
  if (!res.ok) throw new Error(body.error ?? `通信エラー(${res.status})`);
  return body as T;
}

/** 変更分をNotionへ送る */
async function syncOnce() {
  const s = st();
  if (s.mode !== "notion" || syncing || s.needLogin) return;
  if (!pendingCount()) return refreshStatus();
  if (!navigator.onLine) return refreshStatus();
  syncing = true;
  refreshStatus();
  let error: string | null = null;
  try {
    // 案件(名前・お客様名・ツール・ステータス)
    for (const [pid, ver] of Object.entries(dirty.projects)) {
      const p = st().projects.find((x) => x.id === pid);
      if (!p) {
        delete dirty.projects[pid];
        continue;
      }
      await api(`/api/projects/${pid}`, {
        method: "PATCH",
        body: JSON.stringify({ name: p.name, clientName: p.clientName, tool: p.tool, status: p.status }),
      });
      if (dirty.projects[pid] === ver) delete dirty.projects[pid];
    }
    // ノード(案件ごと)
    const pids = new Set([...Object.keys(dirty.nodes), ...Object.keys(dirty.deletes)]);
    for (const pid of pids) {
      if (!st().projects.some((p) => p.id === pid)) {
        delete dirty.nodes[pid];
        delete dirty.deletes[pid];
        continue;
      }
      const versions = { ...(dirty.nodes[pid] ?? {}) };
      const deletes = [...(dirty.deletes[pid] ?? [])];
      const byId = new Map(st().nodes.map((n) => [n.id, n]));
      const upserts = Object.keys(versions)
        .map((id) => byId.get(id))
        .filter((n): n is FlowNode => !!n);
      if (!upserts.length && !deletes.length) {
        delete dirty.nodes[pid];
        delete dirty.deletes[pid];
        continue;
      }
      await api(`/api/projects/${pid}/sync`, { method: "POST", body: JSON.stringify({ upserts, deletes }) });
      // 送っている間にさらに変更されたものは残す
      const m = dirty.nodes[pid] ?? {};
      for (const [id, v] of Object.entries(versions)) if (m[id] === v) delete m[id];
      if (!Object.keys(m).length) delete dirty.nodes[pid];
      dirty.deletes[pid] = (dirty.deletes[pid] ?? []).filter((id) => !deletes.includes(id));
      if (!dirty.deletes[pid].length) delete dirty.deletes[pid];
    }
  } catch (e) {
    error = (e as Error).message;
  } finally {
    syncing = false;
    refreshStatus({ error });
    scheduleCache();
  }
}

// ---- 読み込み ---------------------------------------------------------------

/** 案件のノードをNotionから読み込み、まだ送っていない手元の変更と合わせる */
export async function loadProjectNodes(pid: string, force = false) {
  if (st().mode !== "notion" || (!force && loadedProjects.has(pid))) return;
  const hasLocal = st().nodes.some((n) => n.projectId === pid);
  if (!hasLocal) useEditor.setState({ loadingProject: true });
  try {
    const { nodes: remote } = await api<{ nodes: FlowNode[] }>(`/api/projects/${pid}/nodes`);
    loadedProjects.add(pid);
    const local = st().nodes.filter((n) => n.projectId === pid);
    const localById = new Map(local.map((n) => [n.id, n]));
    const pendingIds = new Set(Object.keys(dirty.nodes[pid] ?? {}));
    const deleted = new Set(dirty.deletes[pid] ?? []);
    const merged: FlowNode[] = [];
    const seen = new Set<string>();
    for (const r of remote) {
      if (deleted.has(r.id) || seen.has(r.id)) continue;
      seen.add(r.id);
      const l = localById.get(r.id);
      if (l && pendingIds.has(r.id)) merged.push(l);
      else {
        // 段階3まではブラウザ内にだけある画像を残す
        const localImages = (l?.images ?? []).filter((i) => i.url.startsWith("data:"));
        merged.push(localImages.length ? { ...r, images: [...r.images, ...localImages] } : r);
      }
    }
    for (const l of local) if (!seen.has(l.id) && pendingIds.has(l.id)) merged.push(l);
    applyRemote((s) => ({
      nodes: [...s.nodes.filter((n) => n.projectId !== pid), ...merged],
      past: s.currentProjectId === pid ? [] : s.past,
      future: s.currentProjectId === pid ? [] : s.future,
    }));
    refreshStatus({ error: null });
  } catch (e) {
    refreshStatus({ error: (e as Error).message });
  } finally {
    useEditor.setState({ loadingProject: false });
  }
}

async function loadProjects() {
  const { projects: remote } = await api<{ projects: Project[] }>("/api/projects");
  const local = new Map(st().projects.map((p) => [p.id, p]));
  const merged = remote.map((r) => (dirty.projects[r.id] && local.get(r.id) ? local.get(r.id)! : r));
  const ids = new Set(merged.map((p) => p.id));
  applyRemote((s) => ({
    projects: merged,
    // Notion側で消された案件のノードは手元からも消す
    nodes: s.nodes.filter((n) => ids.has(n.projectId)),
    currentProjectId: s.currentProjectId && ids.has(s.currentProjectId) ? s.currentProjectId : (merged[0]?.id ?? null),
  }));
}

/** 起動時に1回だけ呼ぶ */
export async function startSync() {
  if (started) return;
  started = true;
  watchChanges();
  await boot();

  // 案件を切り替えたらノードを読み込む
  useEditor.subscribe((s, prev) => {
    if (s.currentProjectId && s.currentProjectId !== prev.currentProjectId) loadProjectNodes(s.currentProjectId);
  });
  setInterval(syncOnce, SYNC_INTERVAL);
  window.addEventListener("online", () => syncOnce());
  window.addEventListener("offline", () => refreshStatus());
  // 送っていない変更があるのに閉じようとしたら確認
  window.addEventListener("beforeunload", (e) => {
    if (st().mode === "notion" && pendingCount()) {
      e.preventDefault();
      syncOnce();
    }
  });
  // 別のタブ・アプリから戻ってきたら最新を読み直す
  document.addEventListener("visibilitychange", () => {
    const pid = st().currentProjectId;
    if (document.visibilityState === "visible" && pid && !pendingCount()) loadProjectNodes(pid, true);
  });
}

async function boot() {
  let status: { notion: boolean; admin: boolean; passwordConfigured: boolean };
  try {
    status = await api("/api/status");
  } catch {
    status = { notion: false, admin: true, passwordConfigured: false };
  }

  if (!status.notion) {
    // Notion未設定:ブラウザ内だけに保存(お試し用)
    cacheKey = "line-designer:local:v1";
    const cache = await readCache();
    applyRemote({
      mode: "local",
      projects: cache?.projects ?? sampleProjects,
      nodes: cache?.nodes ?? sampleNodes,
      comments: cache?.comments ?? sampleComments,
      currentProjectId: cache?.currentProjectId ?? sampleProjects[0]?.id ?? null,
    });
    refreshStatus();
    return;
  }

  if (!status.admin) {
    useEditor.setState({ needLogin: true, mode: "notion" });
    return; // ログイン後に afterLogin() から続ける
  }
  await bootNotion();
}

async function bootNotion() {
  cacheKey = "line-designer:notion:v1";
  const cache = await readCache();
  if (cache) dirty = cache.dirty ?? dirty;
  applyRemote({
    mode: "notion",
    needLogin: false,
    projects: cache?.projects ?? [],
    nodes: cache?.nodes ?? [],
    comments: cache?.comments ?? [],
    currentProjectId: cache?.currentProjectId ?? null,
  });
  refreshStatus();
  try {
    await loadProjects();
    const pid = st().currentProjectId;
    if (pid) await loadProjectNodes(pid);
    syncOnce();
  } catch (e) {
    refreshStatus({ error: (e as Error).message });
  }
}

// ---- 画面から呼ぶ操作 -------------------------------------------------------

export async function login(password: string) {
  await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
  useEditor.setState({ needLogin: false });
  await bootNotion();
}

export async function logout() {
  await fetch("/api/logout", { method: "POST" });
  location.reload();
}

/** 新しい案件(Notionモードでは先にNotionに案件を作る) */
export async function newProject(init?: Partial<Project>, nodes?: (projectId: string) => FlowNode[]) {
  const s = st();
  if (s.mode !== "notion") {
    const id = nanoid(10);
    const p: Project = {
      id,
      name: "新しい案件",
      clientName: "",
      tool: "lstep",
      status: "draft",
      shareToken: null,
      updatedAt: new Date().toISOString(),
      ...init,
    };
    s.insertProject(p, nodes ? nodes(id) : [starter(p)]);
    return;
  }
  const { project } = await api<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "新しい案件", tool: "lstep", status: "draft", ...init }),
  });
  loadedProjects.add(project.id);
  // 案件は作成済み。中のノードは「変更あり」として次の同期で送られる
  st().insertProject(project, nodes ? nodes(project.id) : [starter(project)]);
  syncOnce();
}

function starter(p: Project) {
  const start = newNode(p.id, p.tool, "trigger", { x: 0, y: 0 });
  start.title = "友だち追加";
  start.body = "友だち追加されたとき";
  return start;
}

/** サンプル案件を追加 */
export async function addSampleProject() {
  const src = sampleProjects[0];
  await newProject({ name: `${src.name}(サンプル)`, clientName: src.clientName, tool: src.tool, status: "draft" }, (pid) =>
    cloneNodes(
      sampleNodes.filter((n) => n.projectId === src.id),
      pid,
      () => nanoid(10),
    ),
  );
}

export async function removeProject(id: string) {
  const s = st();
  if (s.mode === "notion") {
    await api(`/api/projects/${id}`, { method: "DELETE" });
    delete dirty.nodes[id];
    delete dirty.deletes[id];
    delete dirty.projects[id];
    // ノードの削除はサーバーで済ませたので、変更扱いにせずに手元から消す
    applyingRemote = true;
    try {
      s.deleteProject(id);
    } finally {
      applyingRemote = false;
    }
    refreshStatus();
    return;
  }
  s.deleteProject(id);
}

/** 失敗したときの「今すぐ再試行」 */
export function retrySync() {
  syncOnce();
}
