import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { nanoid } from "nanoid";
import { z } from "zod";
import { allButtons, newNode, setTarget } from "@/lib/flow";
import { autoLayout } from "@/lib/layout";
import { TOOL_LABELS, getKindDef, getKindsForTool } from "@/lib/templates";
import type { FlowButton, FlowNode, Project, ProjectStatus, ToolKind } from "@/lib/types";
import { createProject, listNodes, listProjects, syncNodes, updateProject } from "./notion";

/**
 * Claude から LINE構成デザイナー を操作するための MCP サーバー。
 * データはアプリと同じ Notion に読み書きする。
 */

const STATUS_LABEL: Record<ProjectStatus, string> = { draft: "作成中", review: "確認中", fixed: "確定" };
const NEXT_WORDS = ["次へ", "next", "続けて送る", ""];

// ---- 探す・表示する ---------------------------------------------------------

async function findProject(ref: string): Promise<Project> {
  const projects = await listProjects();
  const exact = projects.find((p) => p.id === ref || p.id.replace(/-/g, "") === ref.replace(/-/g, "") || p.name === ref);
  if (exact) return exact;
  const hits = projects.filter((p) => p.name.includes(ref) || p.clientName.includes(ref));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error(`案件「${ref}」が見つかりません。list_projects で確認してください`);
  throw new Error(`「${ref}」に当てはまる案件が複数あります: ${hits.map((p) => `${p.name}(${p.id})`).join(" / ")}`);
}

function findNode(nodes: FlowNode[], ref: string): FlowNode {
  const byId = nodes.find((n) => n.id === ref);
  if (byId) return byId;
  const exact = nodes.filter((n) => n.title === ref);
  if (exact.length === 1) return exact[0];
  const part = nodes.filter((n) => n.title.includes(ref));
  if (!exact.length && part.length === 1) return part[0];
  const hits = exact.length ? exact : part;
  if (!hits.length) throw new Error(`ノード「${ref}」が見つかりません。get_flow で確認してください`);
  throw new Error(`「${ref}」に当てはまるノードが複数あります。IDで指定してください: ${hits.map((n) => `${n.title}[${n.id}]`).join(" / ")}`);
}

/** ボタン名(または「次へ」)から、つなぐ口(handleId)を探す */
function findHandle(node: FlowNode, button?: string | null): string {
  if (!button || NEXT_WORDS.includes(button.trim())) return "next";
  const all = allButtons(node);
  const b = all.find((x) => x.id === button) ?? all.find((x) => x.label === button) ?? all.find((x) => x.label.includes(button));
  if (!b) throw new Error(`「${node.title}」にボタン「${button}」はありません。ボタン: ${all.map((x) => x.label).join(" / ") || "なし"}`);
  return `btn:${b.id}`;
}

function describeFlow(project: Project, nodes: FlowNode[]) {
  const title = (id: string | null) => {
    if (!id) return "(未接続)";
    const n = nodes.find((x) => x.id === id);
    return n ? `「${n.title}」[${id}]` : `(見つからないノード ${id})`;
  };
  const kindLabel = (k: string) => {
    const d = getKindDef(project.tool, k);
    return `${d.icon}${d.label}`;
  };
  const lines = [
    `# ${project.name}`,
    `案件ID: ${project.id} / お客様: ${project.clientName || "(未設定)"} / ツール: ${TOOL_LABELS[project.tool]} / ステータス: ${STATUS_LABEL[project.status]}`,
    `ノード数: ${nodes.length}`,
    "",
  ];
  // 起点から順に並べる(つながっていないものは後ろ)
  const order: FlowNode[] = [];
  const seen = new Set<string>();
  const visit = (n: FlowNode | undefined) => {
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    order.push(n);
    for (const b of allButtons(n)) visit(nodes.find((x) => x.id === b.targetId));
    visit(nodes.find((x) => x.id === n.nextId));
  };
  nodes.filter((n) => n.kind === "trigger").forEach(visit);
  nodes.filter((n) => n.kind === "richmenu").forEach(visit);
  nodes.forEach(visit);
  for (const n of order) {
    lines.push(`## 「${n.title}」[${n.id}] ${kindLabel(n.kind)}`);
    if (n.body) lines.push(`本文: ${n.body.replace(/\n/g, "⏎")}`);
    for (const b of n.buttons) lines.push(`- ボタン「${b.label}」→ ${title(b.targetId)}`);
    for (const c of n.cards) {
      lines.push(`- カード「${c.title}」${c.text ? `(${c.text.replace(/\n/g, " ")})` : ""}`);
      for (const b of c.buttons) lines.push(`  - ボタン「${b.label}」→ ${title(b.targetId)}`);
    }
    if (n.nextId) lines.push(`- 次へ → ${title(n.nextId)}`);
    if (n.memo) lines.push(`メモ: ${n.memo.replace(/\n/g, "⏎")}`);
    if (n.images.length) lines.push(`画像: ${n.images.length}枚`);
    lines.push("");
  }
  return lines.join("\n");
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

/**
 * Claudeが改行を「\\n」という2文字のまま送ってくることがあるので、本物の改行に直す
 * (本文・メモ・カードの説明など、すべての文字の項目が対象)
 */
function fixNewlines<T>(v: T): T {
  if (typeof v === "string") return v.replace(/\\r\\n|\\n/g, "\n") as T;
  if (Array.isArray(v)) return v.map(fixNewlines) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixNewlines(x)])) as T;
  return v;
}

/** エラーは例外ではなく「失敗しました」と返して、Claudeが直して再実行できるようにする */
function safe<A>(fn: (args: A) => Promise<string>) {
  return async (args: A) => {
    try {
      return text(await fn(fixNewlines(args)));
    } catch (e) {
      return { ...text(`エラー: ${(e as Error).message}`), isError: true };
    }
  };
}

// ---- 書き込みの共通処理 -----------------------------------------------------

async function edit(
  projectRef: string,
  fn: (ctx: { project: Project; nodes: FlowNode[] }) => { nodes: FlowNode[]; deletes?: string[]; message: string },
) {
  const project = await findProject(projectRef);
  const before = await listNodes(project.id);
  const result = fn({ project, nodes: before });
  const old = new Map(before.map((n) => [n.id, JSON.stringify(n)]));
  const changed = result.nodes.filter((n) => old.get(n.id) !== JSON.stringify(n));
  await syncNodes(project.id, changed, result.deletes ?? []);
  return `${result.message}\n\n(変更 ${changed.length}件・削除 ${result.deletes?.length ?? 0}件をNotionに保存しました。アプリを開いている場合は再読み込みすると反映されます)`;
}

/** 親ノードの右側の空いていそうな場所 */
function placeAfter(nodes: FlowNode[], parent?: FlowNode) {
  if (!parent) {
    const maxY = nodes.length ? Math.max(...nodes.map((n) => n.position.y)) : -250;
    const minX = nodes.length ? Math.min(...nodes.map((n) => n.position.x)) : 0;
    return { x: minX, y: maxY + 250 };
  }
  const x = parent.position.x + 340;
  const taken = nodes.filter((n) => Math.abs(n.position.x - x) < 200).map((n) => n.position.y);
  let y = parent.position.y;
  while (taken.some((t) => Math.abs(t - y) < 160)) y += 170;
  return { x, y };
}

function makeButtons(labels: { label: string; target?: string | null }[], nodes: FlowNode[], existing: FlowButton[] = []) {
  return labels.map(({ label, target }) => {
    const keep = existing.find((b) => b.label === label);
    const targetId = target === undefined ? (keep?.targetId ?? null) : target === null || target === "" ? null : findNode(nodes, target).id;
    return { id: keep?.id ?? nanoid(8), label, targetId };
  });
}

// ---- MCPサーバー ------------------------------------------------------------

const projectArg = z.string().describe("案件のID、または案件名(一部でも可)");
const nodeArg = z.string().describe("ノードのID、またはノード名(get_flow の「」内の名前)");
const buttonArg = z
  .string()
  .optional()
  .describe("どのボタンからつなぐか(ボタンの文言)。省略または「次へ」なら、ボタンではなく『続けて送る(次へ)』からつなぐ");

export function buildMcpServer() {
  const server = new McpServer(
    { name: "line-flow-designer", version: "1.0.0" },
    {
      instructions:
        "公式LINEの構成(シナリオ・分岐・画面)を設計するアプリ「LINE構成デザイナー」を操作します。" +
        "まず list_projects で案件を探し、get_flow で今の構成を確認してから編集してください。" +
        "ノードは名前でもIDでも指定できますが、同じ名前が複数あるときはIDを使ってください。" +
        "使えるノードの種類は案件の拡張ツール(Lステップ/Lメッセージ)で違うので、list_node_kinds で確認できます。" +
        "大きく構成を変えた後は auto_layout で見た目を整えるときれいになります。",
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "案件の一覧",
      description: "案件(お客様ごとのLINE構成)の一覧を返す",
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const ps = await listProjects();
      if (!ps.length) return "案件はまだありません";
      return ps
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => `- ${p.name}(お客様: ${p.clientName || "未設定"} / ${TOOL_LABELS[p.tool]} / ${STATUS_LABEL[p.status]}) ID: ${p.id}`)
        .join("\n");
    }),
  );

  server.registerTool(
    "get_flow",
    {
      title: "構成を見る",
      description: "案件の構成(ノード・ボタン・つながり)を、起点から順に文章で返す",
      inputSchema: { project: projectArg },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ project }: { project: string }) => {
      const p = await findProject(project);
      return describeFlow(p, await listNodes(p.id));
    }),
  );

  server.registerTool(
    "list_node_kinds",
    {
      title: "ノードの種類",
      description: "その案件で使えるノードの種類(kind)と説明を返す。Lステップ/Lメッセージで呼び名が違う",
      inputSchema: { project: projectArg },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ project }: { project: string }) => {
      const p = await findProject(project);
      return getKindsForTool(p.tool)
        .map(
          (k) =>
            `- kind: ${k.key} … ${k.icon}${k.label}:${k.description}` +
            (k.hasButtons ? `(ボタン最大${k.maxButtons}個・ボタンごとに分岐)` : "") +
            (k.hasCards ? "(カードごとにボタン)" : "") +
            `/本文欄=${k.bodyLabel}`,
        )
        .join("\n");
    }),
  );

  server.registerTool(
    "create_project",
    {
      title: "案件を作る",
      description: "新しい案件を作る(起点ノード「友だち追加」も一緒に作る)",
      inputSchema: {
        name: z.string().describe("案件名"),
        client_name: z.string().optional().describe("お客様名"),
        tool: z.enum(["lstep", "lmessage"]).describe("拡張ツール。lstep=Lステップ / lmessage=Lメッセージ"),
      },
    },
    safe(async ({ name, client_name, tool }: { name: string; client_name?: string; tool: ToolKind }) => {
      const p = await createProject({ name, clientName: client_name ?? "", tool, status: "draft" });
      const start = newNode(p.id, tool, "trigger", { x: 0, y: 0 });
      start.title = "友だち追加";
      start.body = "友だち追加されたとき";
      await syncNodes(p.id, [start], []);
      return `案件「${p.name}」を作りました。ID: ${p.id}\n起点ノード「友だち追加」[${start.id}] があります。`;
    }),
  );

  server.registerTool(
    "update_project",
    {
      title: "案件の情報を変える",
      description: "案件名・お客様名・拡張ツール・ステータスを変える",
      inputSchema: {
        project: projectArg,
        name: z.string().optional(),
        client_name: z.string().optional(),
        tool: z.enum(["lstep", "lmessage"]).optional(),
        status: z.enum(["draft", "review", "fixed"]).optional().describe("draft=作成中 / review=確認中 / fixed=確定"),
      },
    },
    safe(async (a: { project: string; name?: string; client_name?: string; tool?: ToolKind; status?: ProjectStatus }) => {
      const p = await findProject(a.project);
      await updateProject(p.id, { name: a.name, clientName: a.client_name, tool: a.tool, status: a.status });
      return `案件「${a.name ?? p.name}」を更新しました`;
    }),
  );

  server.registerTool(
    "add_node",
    {
      title: "ノードを追加",
      description:
        "ノード(メッセージ・画面・処理)を追加する。after を指定すると、そのノードのボタン(または次へ)から新しいノードへつなぐ。" +
        "ボタン付きの種類では buttons でボタンの文言を、カルーセルでは cards でカードを指定できる",
      inputSchema: {
        project: projectArg,
        kind: z.string().describe("ノードの種類(list_node_kinds の kind。例: text, buttons, carousel, form, tag)"),
        title: z.string().describe("ノード名(構成図に出る管理用の名前)"),
        body: z.string().optional().describe("本文(テキストならメッセージ文)。改行はそのまま改行で入れる"),
        memo: z.string().optional().describe("メモ(お客様にも見える)"),
        buttons: z.array(z.string()).optional().describe("ボタンの文言の一覧(ボタン系の種類のみ)"),
        cards: z
          .array(z.object({ title: z.string(), text: z.string().optional(), buttons: z.array(z.string()).optional() }))
          .optional()
          .describe("カルーセルのカード"),
        after: nodeArg.optional().describe("このノードの後ろにつなぐ(ノード名またはID)"),
        after_button: buttonArg,
      },
    },
    safe(
      async (a: {
        project: string;
        kind: string;
        title: string;
        body?: string;
        memo?: string;
        buttons?: string[];
        cards?: { title: string; text?: string; buttons?: string[] }[];
        after?: string;
        after_button?: string;
      }) =>
        edit(a.project, ({ project, nodes }) => {
          const kinds = getKindsForTool(project.tool).map((k) => k.key);
          if (!kinds.includes(a.kind)) throw new Error(`種類「${a.kind}」は使えません。使える種類: ${kinds.join(", ")}`);
          const def = getKindDef(project.tool, a.kind);
          const parent = a.after ? findNode(nodes, a.after) : undefined;
          const node = newNode(project.id, project.tool, a.kind, placeAfter(nodes, parent));
          node.title = a.title;
          node.body = a.body ?? "";
          node.memo = a.memo ?? "";
          if (a.buttons && def.hasButtons) node.buttons = makeButtons(a.buttons.map((label) => ({ label })), nodes);
          if (a.cards && def.hasCards)
            node.cards = a.cards.map((c) => ({
              id: nanoid(8),
              title: c.title,
              text: c.text ?? "",
              imageId: null,
              buttons: makeButtons((c.buttons ?? ["詳しく見る"]).map((label) => ({ label })), nodes),
            }));
          let out = [...nodes, node];
          let how = "";
          if (parent) {
            let p = parent;
            let handle: string;
            try {
              handle = findHandle(p, a.after_button);
            } catch (e) {
              // まだないボタン名なら、ボタンを作ってからつなぐ
              const pdef = getKindDef(project.tool, p.kind);
              if (!pdef.hasButtons || !a.after_button) throw e;
              const b = { id: nanoid(8), label: a.after_button, targetId: null };
              p = { ...p, buttons: [...p.buttons, b] };
              handle = `btn:${b.id}`;
            }
            p = setTarget(p, handle, node.id);
            out = out.map((n) => (n.id === p.id ? p : n));
            how = `「${parent.title}」の${handle === "next" ? "次へ" : `ボタン「${a.after_button}」`}からつなぎました。`;
          }
          return { nodes: out, message: `ノード「${node.title}」[${node.id}] を追加しました。${how}` };
        }),
    ),
  );

  server.registerTool(
    "update_node",
    {
      title: "ノードを編集",
      description: "ノードの名前・本文・メモ・種類を変える(指定した項目だけ変わる)",
      inputSchema: {
        project: projectArg,
        node: nodeArg,
        title: z.string().optional(),
        body: z.string().optional(),
        memo: z.string().optional(),
        kind: z.string().optional().describe("種類を変える場合(list_node_kinds の kind)"),
      },
    },
    safe(async (a: { project: string; node: string; title?: string; body?: string; memo?: string; kind?: string }) =>
      edit(a.project, ({ project, nodes }) => {
        const n = findNode(nodes, a.node);
        let next: FlowNode = {
          ...n,
          title: a.title ?? n.title,
          body: a.body ?? n.body,
          memo: a.memo ?? n.memo,
        };
        if (a.kind && a.kind !== n.kind) {
          const kinds = getKindsForTool(project.tool).map((k) => k.key);
          if (!kinds.includes(a.kind)) throw new Error(`種類「${a.kind}」は使えません。使える種類: ${kinds.join(", ")}`);
          const def = getKindDef(project.tool, a.kind);
          const fresh = newNode(project.id, project.tool, a.kind, n.position);
          next = {
            ...next,
            kind: a.kind,
            buttons: def.hasButtons ? (n.buttons.length ? n.buttons : fresh.buttons) : [],
            cards: def.hasCards ? (n.cards.length ? n.cards : fresh.cards) : [],
          };
        }
        return { nodes: nodes.map((x) => (x.id === n.id ? next : x)), message: `ノード「${next.title}」を更新しました` };
      }),
    ),
  );

  server.registerTool(
    "set_buttons",
    {
      title: "ボタンを設定",
      description:
        "ボタン系ノード(ボタン・クイックリプライ・リッチメニュー・条件分岐)のボタンを、指定した一覧で置き換える。" +
        "同じ文言のボタンは今のつながりを引き継ぐ。target を指定するとそのノードへつなぐ(null でつながりを外す)",
      inputSchema: {
        project: projectArg,
        node: nodeArg,
        buttons: z.array(
          z.object({
            label: z.string(),
            target: z.string().nullable().optional().describe("つなぎ先のノード名またはID。省略で今のまま、null で外す"),
          }),
        ),
      },
    },
    safe(async (a: { project: string; node: string; buttons: { label: string; target?: string | null }[] }) =>
      edit(a.project, ({ project, nodes }) => {
        const n = findNode(nodes, a.node);
        const def = getKindDef(project.tool, n.kind);
        if (!def.hasButtons) throw new Error(`「${n.title}」(${def.label})はボタンを持てない種類です。update_node で種類を変えてください`);
        const buttons = makeButtons(a.buttons, nodes, n.buttons);
        const warn = def.maxButtons && buttons.length > def.maxButtons ? `\n※ ${def.label}のボタンは最大${def.maxButtons}個が目安です` : "";
        return { nodes: nodes.map((x) => (x.id === n.id ? { ...n, buttons } : x)), message: `「${n.title}」のボタンを${buttons.length}個にしました${warn}` };
      }),
    ),
  );

  server.registerTool(
    "set_cards",
    {
      title: "カルーセルのカードを設定",
      description: "カルーセルのカードを、指定した一覧で置き換える(同じタイトルのカードは画像を引き継ぐ)",
      inputSchema: {
        project: projectArg,
        node: nodeArg,
        cards: z.array(
          z.object({
            title: z.string(),
            text: z.string().optional(),
            buttons: z
              .array(z.object({ label: z.string(), target: z.string().nullable().optional() }))
              .optional(),
          }),
        ),
      },
    },
    safe(
      async (a: {
        project: string;
        node: string;
        cards: { title: string; text?: string; buttons?: { label: string; target?: string | null }[] }[];
      }) =>
        edit(a.project, ({ project, nodes }) => {
          const n = findNode(nodes, a.node);
          if (!getKindDef(project.tool, n.kind).hasCards) throw new Error(`「${n.title}」はカルーセルではありません`);
          const cards = a.cards.map((c) => {
            const keep = n.cards.find((x) => x.title === c.title);
            return {
              id: keep?.id ?? nanoid(8),
              title: c.title,
              text: c.text ?? keep?.text ?? "",
              imageId: keep?.imageId ?? null,
              buttons: makeButtons(c.buttons ?? [{ label: "詳しく見る" }], nodes, keep?.buttons),
            };
          });
          return { nodes: nodes.map((x) => (x.id === n.id ? { ...n, cards } : x)), message: `「${n.title}」のカードを${cards.length}枚にしました` };
        }),
    ),
  );

  server.registerTool(
    "connect",
    {
      title: "つなぐ・つなぎ替える",
      description: "ノードのボタン(または次へ)を、別のノードへつなぐ。to を null にするとつながりを外す",
      inputSchema: {
        project: projectArg,
        from: nodeArg,
        button: buttonArg,
        to: z.string().nullable().describe("つなぎ先のノード名またはID。null で外す"),
      },
    },
    safe(async (a: { project: string; from: string; button?: string; to: string | null }) =>
      edit(a.project, ({ nodes }) => {
        const from = findNode(nodes, a.from);
        const to = a.to ? findNode(nodes, a.to) : null;
        if (to?.kind === "trigger") throw new Error("起点ノードにはつなげられません");
        if (to?.id === from.id) throw new Error("自分自身にはつなげられません");
        const handle = findHandle(from, a.button);
        const updated = setTarget(from, handle, to?.id ?? null);
        const what = handle === "next" ? "次へ" : `ボタン「${a.button}」`;
        return {
          nodes: nodes.map((x) => (x.id === from.id ? updated : x)),
          message: to ? `「${from.title}」の${what}を「${to.title}」につなぎました` : `「${from.title}」の${what}のつながりを外しました`,
        };
      }),
    ),
  );

  server.registerTool(
    "add_branch",
    {
      title: "分岐を追加",
      description:
        "ボタン付きノードに新しいボタン(選択肢)を足し、その先に新しいノードを作ってつなぐ。テキストノードに使うとボタン付きに変わる",
      inputSchema: {
        project: projectArg,
        node: nodeArg,
        label: z.string().describe("新しいボタンの文言"),
        new_title: z.string().describe("つなぎ先に作るノードの名前"),
        new_kind: z.string().optional().describe("つなぎ先の種類(省略時 text)"),
        new_body: z.string().optional().describe("つなぎ先の本文"),
      },
    },
    safe(
      async (a: { project: string; node: string; label: string; new_title: string; new_kind?: string; new_body?: string }) =>
        edit(a.project, ({ project, nodes }) => {
          let n = findNode(nodes, a.node);
          let def = getKindDef(project.tool, n.kind);
          if (!def.hasButtons) {
            if (n.kind !== "text") throw new Error(`「${n.title}」(${def.label})には分岐を付けられません。add_node の after を使ってください`);
            n = { ...n, kind: "buttons", buttons: [] };
            def = getKindDef(project.tool, "buttons");
          }
          const kind = a.new_kind ?? "text";
          if (!getKindsForTool(project.tool).some((k) => k.key === kind)) throw new Error(`種類「${kind}」は使えません`);
          const child = newNode(project.id, project.tool, kind, placeAfter(nodes, n));
          child.title = a.new_title;
          child.body = a.new_body ?? "";
          const btn = { id: nanoid(8), label: a.label, targetId: child.id };
          const updated = { ...n, buttons: [...n.buttons, btn] };
          return {
            nodes: [...nodes.map((x) => (x.id === n.id ? updated : x)), child],
            message: `「${n.title}」にボタン「${a.label}」を足し、新しいノード「${child.title}」[${child.id}] につなぎました`,
          };
        }),
    ),
  );

  server.registerTool(
    "set_image",
    {
      title: "画像を設定",
      description:
        "ノードやカルーセルのカードにイメージ画像を設定する。card を指定するとそのカードの画像に、" +
        "省略するとノードの画像(ボタン付きメッセージの上部画像・画像メッセージ・リッチメニューの背景など)になる。" +
        "image_url は https:// で始まる画像のURL、またはアプリに同梱のサンプル画像(/samples/〜)",
      inputSchema: {
        project: projectArg,
        node: nodeArg,
        image_url: z.string().describe("画像のURL(https://〜 または /samples/〜)"),
        name: z.string().optional().describe("画像の名前(説明)"),
        card: z.string().optional().describe("カルーセルのカードのタイトル(カードに設定する場合)"),
      },
    },
    safe(async (a: { project: string; node: string; image_url: string; name?: string; card?: string }) =>
      edit(a.project, ({ nodes }) => {
        const url = a.image_url.trim();
        if (!/^https:\/\/\S+$/.test(url) && !/^\/samples\/[\w.-]+$/.test(url))
          throw new Error("image_url は https:// で始まるURLか、/samples/〜 の形で指定してください");
        const n = findNode(nodes, a.node);
        const image = { id: nanoid(8), url, name: a.name ?? url.split("/").pop() ?? "image" };
        let updated: FlowNode;
        if (a.card) {
          const card = n.cards.find((c) => c.title === a.card) ?? n.cards.find((c) => c.title.includes(a.card!));
          if (!card) throw new Error(`「${n.title}」にカード「${a.card}」はありません。カード: ${n.cards.map((c) => c.title).join(" / ") || "なし"}`);
          // 前の画像は、他のカードで使っていなければ外す
          const old = card.imageId;
          const stillUsed = old && n.cards.some((c) => c.id !== card.id && c.imageId === old);
          updated = {
            ...n,
            images: [...n.images.filter((i) => i.id !== old || stillUsed), image],
            cards: n.cards.map((c) => (c.id === card.id ? { ...c, imageId: image.id } : c)),
          };
        } else {
          // ノードの画像は先頭の1枚が使われるので、先頭に入れる
          updated = { ...n, images: [image, ...n.images] };
        }
        return {
          nodes: nodes.map((x) => (x.id === n.id ? updated : x)),
          message: `「${n.title}」${a.card ? `のカード「${a.card}」` : ""}に画像を設定しました`,
        };
      }),
    ),
  );

  server.registerTool(
    "delete_node",
    {
      title: "ノードを削除",
      description: "ノードを削除する(このノードへのつながりも外れる。Notionではゴミ箱に移動)",
      inputSchema: { project: projectArg, node: nodeArg },
      annotations: { destructiveHint: true },
    },
    safe(async (a: { project: string; node: string }) =>
      edit(a.project, ({ nodes }) => {
        const n = findNode(nodes, a.node);
        const clear = (b: FlowButton) => (b.targetId === n.id ? { ...b, targetId: null } : b);
        const rest = nodes
          .filter((x) => x.id !== n.id)
          .map((x) => ({
            ...x,
            nextId: x.nextId === n.id ? null : x.nextId,
            buttons: x.buttons.map(clear),
            cards: x.cards.map((c) => ({ ...c, buttons: c.buttons.map(clear) })),
          }));
        return { nodes: rest, deletes: [n.id], message: `ノード「${n.title}」を削除しました` };
      }),
    ),
  );

  server.registerTool(
    "auto_layout",
    {
      title: "自動で整列",
      description: "構成図のノードを、左から右へ流れる形に自動で並べ直す",
      inputSchema: { project: projectArg },
    },
    safe(async (a: { project: string }) =>
      edit(a.project, ({ nodes }) => {
        const pos = autoLayout(nodes);
        return { nodes: nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position })), message: "ノードを並べ直しました" };
      }),
    ),
  );

  return server;
}
