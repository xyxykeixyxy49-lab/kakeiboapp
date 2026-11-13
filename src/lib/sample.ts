import type { FlowComment, FlowNode, Project } from "./types";
import { autoLayout } from "./layout";

// 動作確認用のサンプル案件(段階2以降はNotionから読み込む)

export const sampleProjects: Project[] = [
  {
    id: "p-salon",
    name: "美容サロン 予約導線",
    clientName: "サンプル美容室 様",
    tool: "lstep",
    status: "review",
    shareToken: null,
    updatedAt: "2026-11-12T10:00:00.000Z",
  },
  {
    id: "p-cafe",
    name: "カフェ クーポン配信",
    clientName: "サンプルカフェ 様",
    tool: "lmessage",
    status: "draft",
    shareToken: null,
    updatedAt: "2026-11-10T10:00:00.000Z",
  },
];

const n = (p: Partial<FlowNode> & Pick<FlowNode, "id" | "projectId" | "kind" | "title">): FlowNode => ({
  body: "",
  buttons: [],
  cards: [],
  nextId: null,
  memo: "",
  images: [],
  position: { x: 0, y: 0 },
  ...p,
});

const salon: FlowNode[] = [
  n({ id: "s1", projectId: "p-salon", kind: "trigger", title: "友だち追加", body: "店頭QRコードから友だち追加", nextId: "s2" }),
  n({
    id: "s2",
    projectId: "p-salon",
    kind: "text",
    title: "あいさつ",
    body: "友だち追加ありがとうございます✨\nサンプル美容室です。\nLINEからいつでもご予約いただけます!",
    nextId: "s3",
  }),
  n({
    id: "s3",
    projectId: "p-salon",
    kind: "buttons",
    title: "ご用件の確認",
    body: "本日はどのようなご用件でしょうか?",
    buttons: [
      { id: "b1", label: "メニューを見る", targetId: "s4" },
      { id: "b2", label: "予約する", targetId: "s5" },
      { id: "b3", label: "質問する", targetId: "s7" },
    ],
    memo: "ボタンは3つまでに絞る想定",
  }),
  n({
    id: "s4",
    projectId: "p-salon",
    kind: "carousel",
    title: "メニュー一覧",
    cards: [
      { id: "c1", title: "カット", text: "¥4,400〜\nシャンプー・ブロー込み", imageId: null, buttons: [{ id: "cb1", label: "これで予約", targetId: "s5" }] },
      { id: "c2", title: "カラー", text: "¥6,600〜\n白髪染めもOK", imageId: null, buttons: [{ id: "cb2", label: "これで予約", targetId: "s5" }] },
      { id: "c3", title: "トリートメント", text: "¥3,300〜\n髪質改善コースあり", imageId: null, buttons: [{ id: "cb3", label: "これで予約", targetId: "s5" }] },
    ],
  }),
  n({
    id: "s5",
    projectId: "p-salon",
    kind: "form",
    title: "予約フォーム",
    body: "お名前\nご希望日時\nご希望メニュー\n担当者の指名",
    nextId: "s6",
  }),
  n({ id: "s6", projectId: "p-salon", kind: "tag", title: "予約済みタグ", body: "予約済み\n新規客", nextId: "s8" }),
  n({
    id: "s7",
    projectId: "p-salon",
    kind: "text",
    title: "質問受付",
    body: "ご質問をこのトークにそのままお送りください。\nスタッフが順番にお返事します🙇",
  }),
  n({ id: "s8", projectId: "p-salon", kind: "wait", title: "来店前日", body: "予約日の前日 18:00", nextId: "s9" }),
  n({
    id: "s9",
    projectId: "p-salon",
    kind: "text",
    title: "リマインド",
    body: "明日はご来店予定日です。\nお気をつけてお越しください😊",
  }),
  n({
    id: "s10",
    projectId: "p-salon",
    kind: "richmenu",
    title: "リッチメニュー",
    body: "常に表示するメニュー",
    buttons: [
      { id: "r1", label: "予約する", targetId: "s5" },
      { id: "r2", label: "メニュー", targetId: "s4" },
      { id: "r3", label: "お問い合わせ", targetId: "s7" },
    ],
  }),
];

const cafe: FlowNode[] = [
  n({ id: "f1", projectId: "p-cafe", kind: "trigger", title: "友だち追加", body: "友だち追加されたとき", nextId: "f2" }),
  n({
    id: "f2",
    projectId: "p-cafe",
    kind: "quickreply",
    title: "アンケート",
    body: "ご来店の頻度を教えてください☕",
    buttons: [
      { id: "q1", label: "週1以上", targetId: "f3" },
      { id: "q2", label: "月1くらい", targetId: "f3" },
      { id: "q3", label: "はじめて", targetId: "f4" },
    ],
  }),
  n({ id: "f3", projectId: "p-cafe", kind: "text", title: "常連さん向け", body: "いつもありがとうございます!\nドリンク50円引きクーポンをどうぞ🎁" }),
  n({ id: "f4", projectId: "p-cafe", kind: "text", title: "初回向け", body: "はじめまして!\n初回限定 ドリンク1杯無料クーポンです🎉" }),
];

function laidOut(nodes: FlowNode[]) {
  const pos = autoLayout(nodes);
  return nodes.map((x) => ({ ...x, position: pos[x.id] }));
}

export const sampleNodes: FlowNode[] = [...laidOut(salon), ...laidOut(cafe)];

export const sampleComments: FlowComment[] = [
  {
    id: "cm1",
    nodeId: "s3",
    parentId: null,
    author: "サンプル美容室",
    body: "「キャンセルしたい」ボタンも欲しいです",
    resolved: false,
    createdAt: "2026-11-12T10:05:00.000Z",
  },
  {
    id: "cm2",
    nodeId: "s3",
    parentId: "cm1",
    author: "担当",
    body: "承知しました。リッチメニューに入れる案も比較しましょう",
    resolved: false,
    createdAt: "2026-11-12T10:07:00.000Z",
  },
];
