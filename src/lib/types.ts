// アプリ全体で使うデータの形(段階2でNotionの各DBに対応させる)

export type ToolKind = "lstep" | "lmessage";

export type ProjectStatus = "draft" | "review" | "fixed";

/** 案件(Notion「案件」DB) */
export interface Project {
  id: string;
  name: string;
  clientName: string;
  tool: ToolKind;
  status: ProjectStatus;
  shareToken: string | null;
  updatedAt: string;
}

/** ボタン・選択肢(分岐) */
export interface FlowButton {
  id: string;
  label: string;
  /** 遷移先ノードID(未設定なら null) */
  targetId: string | null;
}

/** カルーセルの1枚 */
export interface CarouselCard {
  id: string;
  title: string;
  text: string;
  imageId: string | null;
  buttons: FlowButton[];
}

/** 画像(段階3でGoogleドライブのファイルIDになる) */
export interface FlowImage {
  id: string;
  /** 段階1ではブラウザ内のdata URL。段階3以降は /api/images/[fileId] */
  url: string;
  name: string;
}

/** ノード(Notion「ノード」DB) */
export interface FlowNode {
  id: string;
  projectId: string;
  /** ノードの種類(templates.ts のキー) */
  kind: string;
  title: string;
  body: string;
  buttons: FlowButton[];
  cards: CarouselCard[];
  /** ボタンを持たない種類で使う「次へ」の遷移先 */
  nextId: string | null;
  memo: string;
  images: FlowImage[];
  position: { x: number; y: number };
}

/** コメント(Notion「コメント」DB) */
export interface FlowComment {
  id: string;
  nodeId: string;
  parentId: string | null;
  author: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}
