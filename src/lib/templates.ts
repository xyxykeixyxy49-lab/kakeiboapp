import type { ToolKind } from "./types";

/**
 * ノードの種類の定義。
 * 案件で選んだ拡張ツール(Lステップ / Lメッセージ)に応じて、
 * 使える種類と表示名が切り替わる。
 */

/** プレビューでの見せ方 */
export type PreviewStyle =
  | "trigger" // 起点(友だち追加・キーワードなど)
  | "text" // 吹き出し
  | "image" // 画像メッセージ
  | "buttons" // ボタン付きカード
  | "carousel" // カルーセル
  | "richmenu" // リッチメニュー
  | "form" // 回答フォーム
  | "system" // タグ付け・アクションなど、お客様には見えない処理
  | "condition" // 条件分岐
  | "wait"; // 待ち時間(ステップ配信)

export interface NodeKindDef {
  key: string;
  label: string;
  icon: string;
  /** ノードの色(Tailwindのクラスではなく色コード) */
  color: string;
  preview: PreviewStyle;
  /** ボタン(分岐)を持てるか */
  hasButtons: boolean;
  /** ボタン数の上限(LINEの仕様の目安) */
  maxButtons?: number;
  /** カルーセルのカードを持つか */
  hasCards: boolean;
  /** 本文欄の名前 */
  bodyLabel: string;
  /** 新規作成時のボタン名 */
  defaultButtonLabel?: string;
  description: string;
}

const base: Record<string, Omit<NodeKindDef, "key">> = {
  trigger: {
    label: "起点",
    icon: "🚩",
    color: "#64748b",
    preview: "trigger",
    hasButtons: false,
    hasCards: false,
    bodyLabel: "条件(どんな時に始まるか)",
    description: "友だち追加・キーワード受信など、流れのスタート",
  },
  text: {
    label: "テキスト",
    icon: "💬",
    color: "#06c755",
    preview: "text",
    hasButtons: false,
    hasCards: false,
    bodyLabel: "メッセージ本文",
    description: "通常の吹き出しメッセージ",
  },
  image: {
    label: "画像",
    icon: "🖼️",
    color: "#0ea5e9",
    preview: "image",
    hasButtons: false,
    hasCards: false,
    bodyLabel: "補足(お客様には表示されません)",
    description: "画像のみのメッセージ",
  },
  buttons: {
    label: "ボタン",
    icon: "🔘",
    color: "#16a34a",
    preview: "buttons",
    hasButtons: true,
    maxButtons: 4,
    hasCards: false,
    bodyLabel: "本文",
    defaultButtonLabel: "選択肢",
    description: "本文+最大4つのボタン。ボタンごとに分岐できる",
  },
  quickreply: {
    label: "クイックリプライ",
    icon: "⚡",
    color: "#22c55e",
    preview: "text",
    hasButtons: true,
    maxButtons: 13,
    hasCards: false,
    bodyLabel: "本文",
    defaultButtonLabel: "回答",
    description: "吹き出しの下に出る選択肢(最大13個)",
  },
  carousel: {
    label: "カルーセル",
    icon: "🎠",
    color: "#f59e0b",
    preview: "carousel",
    hasButtons: false,
    hasCards: true,
    bodyLabel: "補足(お客様には表示されません)",
    description: "横にスライドするカード(最大10枚)",
  },
  richmenu: {
    label: "リッチメニュー",
    icon: "📱",
    color: "#8b5cf6",
    preview: "richmenu",
    hasButtons: true,
    maxButtons: 6,
    hasCards: false,
    bodyLabel: "メニューの説明",
    defaultButtonLabel: "メニュー",
    description: "トーク画面下部のメニュー。エリアごとに遷移先を設定",
  },
  form: {
    label: "回答フォーム",
    icon: "📝",
    color: "#ec4899",
    preview: "form",
    hasButtons: false,
    hasCards: false,
    bodyLabel: "質問項目(1行に1つ)",
    description: "アンケート・申込フォーム",
  },
  tag: {
    label: "タグ付け",
    icon: "🏷️",
    color: "#a16207",
    preview: "system",
    hasButtons: false,
    hasCards: false,
    bodyLabel: "付けるタグ名(1行に1つ)",
    description: "友だちにタグを付ける(お客様には見えない)",
  },
  action: {
    label: "アクション",
    icon: "⚙️",
    color: "#475569",
    preview: "system",
    hasButtons: false,
    hasCards: false,
    bodyLabel: "実行する内容",
    description: "シナリオ移動・メニュー切替・通知など",
  },
  condition: {
    label: "条件分岐",
    icon: "🔀",
    color: "#dc2626",
    preview: "condition",
    hasButtons: true,
    maxButtons: 10,
    hasCards: false,
    bodyLabel: "判定する内容",
    defaultButtonLabel: "条件",
    description: "タグや回答内容で流れを分ける",
  },
  wait: {
    label: "待ち時間",
    icon: "⏱️",
    color: "#0891b2",
    preview: "wait",
    hasButtons: false,
    hasCards: false,
    bodyLabel: "待つ時間(例:1日後の20時)",
    description: "ステップ配信の間隔",
  },
};

/** ツールごとの使える種類と、ツール独自の呼び名 */
const toolKinds: Record<ToolKind, { key: string; label?: string; description?: string }[]> = {
  lstep: [
    { key: "trigger", label: "流入経路・起点" },
    { key: "text", label: "テキスト" },
    { key: "buttons", label: "テンプレート(ボタン)", description: "Lステップのテンプレート機能で作るボタン付きメッセージ" },
    { key: "carousel", label: "カルーセル(パネル)" },
    { key: "image" },
    { key: "quickreply" },
    { key: "richmenu" },
    { key: "form", label: "回答フォーム" },
    { key: "tag", label: "タグ付け" },
    { key: "action", label: "アクション", description: "アクション設定(シナリオ移動・友だち情報の更新など)" },
    { key: "condition", label: "条件分岐" },
    { key: "wait", label: "シナリオ配信(待ち時間)" },
  ],
  lmessage: [
    { key: "trigger", label: "起点(友だち追加など)" },
    { key: "text", label: "メッセージ" },
    { key: "buttons", label: "ボタンメッセージ" },
    { key: "carousel", label: "カルーセル" },
    { key: "image" },
    { key: "quickreply" },
    { key: "richmenu" },
    { key: "form", label: "フォーム" },
    { key: "tag", label: "タグ" },
    { key: "action", label: "アクション", description: "アクション(ステップ配信の開始・メニュー切替など)" },
    { key: "condition", label: "条件分岐" },
    { key: "wait", label: "ステップ配信(待ち時間)" },
  ],
};

export const TOOL_LABELS: Record<ToolKind, string> = {
  lstep: "Lステップ",
  lmessage: "Lメッセージ",
};

export function getKindsForTool(tool: ToolKind): NodeKindDef[] {
  return toolKinds[tool].map((k) => ({
    ...base[k.key],
    key: k.key,
    label: k.label ?? base[k.key].label,
    description: k.description ?? base[k.key].description,
  }));
}

export function getKindDef(tool: ToolKind, key: string): NodeKindDef {
  return getKindsForTool(tool).find((k) => k.key === key) ?? { ...base.text, key: "text" };
}
