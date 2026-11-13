import "server-only";
import { Client } from "@notionhq/client";
import type { CarouselCard, FlowButton, FlowImage, FlowNode, Project, ProjectStatus, ToolKind } from "@/lib/types";

/**
 * Notion とのやり取り(サーバー側専用)。
 * ブラウザからは直接呼ばず、/api/... のルートから使う。
 */

// データソースID(=Notionの各データベース)。環境変数で上書きできる
const DS = {
  projects: process.env.NOTION_PROJECTS_DS_ID || "c58df669-f1a5-4db6-a270-57b04e3c8514",
  nodes: process.env.NOTION_NODES_DS_ID || "82ad369e-aac7-4059-9b49-f6eac28dee25",
  comments: process.env.NOTION_COMMENTS_DS_ID || "c595d621-0556-4764-8494-9f170727eaf2",
};

export function notionEnabled() {
  return !!process.env.NOTION_TOKEN;
}

let client: Client | null = null;
function notion() {
  // NOTION_BASE_URL はテスト用(通常は設定しない)
  if (!client) client = new Client({ auth: process.env.NOTION_TOKEN, baseUrl: process.env.NOTION_BASE_URL || undefined });
  return client;
}

// ---- 値の変換 ---------------------------------------------------------------

const TOOL_TO_LABEL: Record<ToolKind, string> = { lstep: "Lステップ", lmessage: "Lメッセージ" };
const STATUS_TO_LABEL: Record<ProjectStatus, string> = { draft: "作成中", review: "確認中", fixed: "確定" };
const KIND_TO_LABEL: Record<string, string> = {
  trigger: "起点",
  text: "テキスト",
  image: "画像",
  buttons: "ボタン",
  quickreply: "クイックリプライ",
  carousel: "カルーセル",
  richmenu: "リッチメニュー",
  form: "回答フォーム",
  tag: "タグ付け",
  action: "アクション",
  condition: "条件分岐",
  wait: "待ち時間",
};
const invert = <T extends string>(o: Record<T, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<string, T>;
const LABEL_TO_TOOL = invert(TOOL_TO_LABEL);
const LABEL_TO_STATUS = invert(STATUS_TO_LABEL);
const LABEL_TO_KIND = invert(KIND_TO_LABEL);

/** Notionの文字欄は1かたまり2000文字までなので分割して入れる */
function rt(text: string) {
  const chunks: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < text.length; i += 1900) chunks.push({ type: "text", text: { content: text.slice(i, i + 1900) } });
  return chunks.slice(0, 100);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = Record<string, any>;

function readText(p: Props | undefined): string {
  if (!p) return "";
  const arr = p.type === "title" ? p.title : p.rich_text;
  return Array.isArray(arr) ? arr.map((t: { plain_text: string }) => t.plain_text).join("") : "";
}
const readSelect = (p: Props | undefined) => (p?.select?.name as string | undefined) ?? "";
const readNumber = (p: Props | undefined) => (typeof p?.number === "number" ? p.number : 0);
function readJson<T>(p: Props | undefined, fallback: T): T {
  const s = readText(p);
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** データソースの全件を取得(100件ずつ) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryAll(dataSourceId: string, filter?: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion().dataSources.query({
      data_source_id: dataSourceId,
      filter,
      start_cursor: cursor,
      page_size: 100,
    });
    out.push(...res.results.filter((r) => r.object === "page"));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

/** 同時実行数を絞って順に処理(NotionのAPIは1秒3回程度まで) */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

// ---- 案件 -------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProject(page: any): Project {
  const p = page.properties as Props;
  return {
    id: page.id,
    name: readText(p["案件名"]) || "(無題の案件)",
    clientName: readText(p["お客様名"]),
    tool: LABEL_TO_TOOL[readSelect(p["拡張ツール"])] ?? "lstep",
    status: LABEL_TO_STATUS[readSelect(p["ステータス"])] ?? "draft",
    shareToken: readText(p["共有トークン"]) || null,
    updatedAt: page.last_edited_time,
  };
}

function projectProps(p: Partial<Project>) {
  const props: Props = {};
  if (p.name !== undefined) props["案件名"] = { title: rt(p.name) };
  if (p.clientName !== undefined) props["お客様名"] = { rich_text: rt(p.clientName) };
  if (p.tool !== undefined) props["拡張ツール"] = { select: { name: TOOL_TO_LABEL[p.tool] } };
  if (p.status !== undefined) props["ステータス"] = { select: { name: STATUS_TO_LABEL[p.status] } };
  if (p.shareToken !== undefined) props["共有トークン"] = { rich_text: rt(p.shareToken ?? "") };
  return props;
}

export async function listProjects(): Promise<Project[]> {
  const pages = await queryAll(DS.projects);
  return pages.map(toProject);
}

export async function createProject(p: Partial<Project>): Promise<Project> {
  const page = await notion().pages.create({
    parent: { data_source_id: DS.projects },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: projectProps({ name: "新しい案件", clientName: "", tool: "lstep", status: "draft", ...p }) as any,
  });
  return toProject(page);
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await notion().pages.update({ page_id: id, properties: projectProps(patch) as any });
}

export async function trashProject(id: string): Promise<void> {
  const nodes = await queryAll(DS.nodes, { property: "案件", relation: { contains: id } });
  await pool(nodes, 3, async (n) => {
    await notion().pages.update({ page_id: n.id, in_trash: true });
  });
  await notion().pages.update({ page_id: id, in_trash: true });
}

// ---- ノード -----------------------------------------------------------------

interface StoredButtons {
  buttons: FlowButton[];
  cards: CarouselCard[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNode(page: any, projectId: string): FlowNode {
  const p = page.properties as Props;
  const stored = readJson<StoredButtons>(p["ボタン・分岐先"], { buttons: [], cards: [] });
  return {
    id: readText(p["ノードID"]) || page.id,
    projectId,
    kind: LABEL_TO_KIND[readSelect(p["種類"])] ?? "text",
    title: readText(p["ノード名"]),
    body: readText(p["本文"]),
    buttons: stored.buttons ?? [],
    cards: stored.cards ?? [],
    nextId: readText(p["次の遷移先"]) || null,
    memo: readText(p["メモ"]),
    images: readJson<FlowImage[]>(p["画像"], []),
    position: { x: readNumber(p["X"]), y: readNumber(p["Y"]) },
  };
}

function nodeProps(n: FlowNode, projectId: string) {
  // ブラウザ内にしかない画像(data URL)はNotionに入れない(段階3でGoogleドライブに保存)
  const images = n.images.filter((i) => !i.url.startsWith("data:"));
  return {
    ノード名: { title: rt(n.title) },
    案件: { relation: [{ id: projectId }] },
    ノードID: { rich_text: rt(n.id) },
    種類: { select: { name: KIND_TO_LABEL[n.kind] ?? "テキスト" } },
    本文: { rich_text: rt(n.body) },
    "ボタン・分岐先": { rich_text: rt(JSON.stringify({ buttons: n.buttons, cards: n.cards })) },
    次の遷移先: { rich_text: rt(n.nextId ?? "") },
    メモ: { rich_text: rt(n.memo) },
    画像: { rich_text: rt(images.length ? JSON.stringify(images) : "") },
    X: { number: Math.round(n.position.x) },
    Y: { number: Math.round(n.position.y) },
  };
}

async function nodePages(projectId: string) {
  return queryAll(DS.nodes, { property: "案件", relation: { contains: projectId } });
}

export async function listNodes(projectId: string): Promise<FlowNode[]> {
  const pages = await nodePages(projectId);
  return pages.map((pg) => toNode(pg, projectId));
}

/** 変更のあったノードだけ書き込み、消されたノードはゴミ箱へ */
export async function syncNodes(projectId: string, upserts: FlowNode[], deletes: string[]) {
  const pages = await nodePages(projectId);
  const pageIdOf = new Map<string, string>();
  for (const pg of pages) {
    const nodeId = readText(pg.properties["ノードID"]);
    if (nodeId) pageIdOf.set(nodeId, pg.id);
  }
  const errors: string[] = [];
  await pool(upserts, 3, async (n) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const properties = nodeProps(n, projectId) as any;
      const pageId = pageIdOf.get(n.id);
      if (pageId) await notion().pages.update({ page_id: pageId, properties });
      else await notion().pages.create({ parent: { data_source_id: DS.nodes }, properties });
    } catch (e) {
      errors.push(`${n.title}: ${(e as Error).message}`);
    }
  });
  await pool(deletes, 3, async (id) => {
    const pageId = pageIdOf.get(id);
    if (!pageId) return;
    try {
      await notion().pages.update({ page_id: pageId, in_trash: true });
    } catch (e) {
      errors.push(`削除 ${id}: ${(e as Error).message}`);
    }
  });
  if (errors.length) throw new Error(errors.slice(0, 3).join(" / "));
}
