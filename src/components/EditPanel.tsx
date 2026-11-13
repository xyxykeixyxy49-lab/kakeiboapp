"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useCurrentProject, useEditor } from "@/store/editor";
import { getKindDef, getKindsForTool } from "@/lib/templates";
import { imageFiles, readImage } from "@/lib/image";
import type { CarouselCard, FlowButton, FlowImage, FlowNode } from "@/lib/types";

const field = "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-[#06c755]";
const NEW_NODE = "__new__";

export default function EditPanel() {
  const project = useCurrentProject()!;
  const selectedNodeId = useEditor((s) => s.selectedNodeId);
  const allNodes = useEditor((s) => s.nodes);
  const { updateNode, changeKind, deleteNodes, addImages, addNode, selectNode } = useEditor.getState();
  const nodes = useMemo(() => allNodes.filter((n) => n.projectId === project.id), [allNodes, project.id]);
  const node = nodes.find((n) => n.id === selectedNodeId);

  // 入力欄の外にいるときの貼り付けも受け付ける
  useEffect(() => {
    if (!selectedNodeId) return;
    const onWinPaste = async (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const files = imageFiles(e.clipboardData?.items);
      if (!files.length) return;
      e.preventDefault();
      useEditor.getState().addImages(selectedNodeId, await Promise.all(files.map((f) => readImage(f))));
    };
    window.addEventListener("paste", onWinPaste);
    return () => window.removeEventListener("paste", onWinPaste);
  }, [selectedNodeId]);

  if (!node) return <Empty text="中央の構成図でノードを選ぶと、ここで内容を編集できます" />;
  const def = getKindDef(project.tool, node.kind);
  const set = (patch: Partial<FlowNode>) => updateNode(node.id, patch);

  /** 遷移先プルダウンで「新しく作る」を選んだとき */
  const pickTarget = (value: string, handleId: string, apply: (target: string | null) => void) => {
    if (value === NEW_NODE) {
      addNode("text", { x: node.position.x + 340, y: node.position.y + Math.random() * 200 }, { nodeId: node.id, handleId });
      selectNode(node.id); // 編集中のノードのまま
      return;
    }
    apply(value || null);
  };

  const others = nodes.filter((n) => n.id !== node.id);

  const onPaste = async (e: React.ClipboardEvent) => {
    const files = imageFiles(e.clipboardData?.items);
    if (!files.length) return;
    e.preventDefault();
    addImages(node.id, await Promise.all(files.map((f) => readImage(f))));
  };

  return (
    <div className="space-y-4 p-4" onPaste={onPaste}>
      <div className="flex gap-2">
        <label className="block w-40 shrink-0">
          <Label>種類</Label>
          <select className={field} value={node.kind} onChange={(e) => changeKind(node.id, e.target.value)}>
            {getKindsForTool(project.tool).map((k) => (
              <option key={k.key} value={k.key}>
                {k.icon} {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1">
          <Label>ノード名(管理用)</Label>
          <input className={field} value={node.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-slate-400">{def.description}</p>

      {node.kind !== "carousel" && (
        <label className="block">
          <Label>{def.bodyLabel}</Label>
          <textarea
            className={`${field} min-h-24 resize-y`}
            value={node.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder={node.kind === "text" ? "例:友だち追加ありがとうございます!" : ""}
          />
        </label>
      )}

      {def.hasButtons && (
        <section>
          <Label>
            {node.kind === "richmenu" ? "メニューのエリア" : node.kind === "condition" ? "条件ごとの分岐" : "ボタン(選択肢)"}
            {def.maxButtons && (
              <span className={node.buttons.length > def.maxButtons ? "ml-1 text-red-500" : "ml-1 text-slate-400"}>
                {node.buttons.length}/{def.maxButtons}
              </span>
            )}
          </Label>
          <ButtonsEditor
            buttons={node.buttons}
            others={others}
            onChange={(buttons) => set({ buttons })}
            onPickTarget={(b, v) => pickTarget(v, `btn:${b.id}`, (t) => set({ buttons: node.buttons.map((x) => (x.id === b.id ? { ...x, targetId: t } : x)) }))}
            addLabel={def.defaultButtonLabel ?? "ボタン"}
          />
        </section>
      )}

      {def.hasCards && (
        <section className="space-y-2">
          <Label>
            カード <span className="text-slate-400">{node.cards.length}/10</span>
          </Label>
          {node.cards.map((c, i) => (
            <CardEditor
              key={c.id}
              card={c}
              index={i}
              node={node}
              others={others}
              onChange={(card) => set({ cards: node.cards.map((x) => (x.id === c.id ? card : x)) })}
              onRemove={() => set({ cards: node.cards.filter((x) => x.id !== c.id) })}
              onPickTarget={(b, v) =>
                pickTarget(v, `btn:${b.id}`, (t) =>
                  set({
                    cards: node.cards.map((x) =>
                      x.id === c.id ? { ...x, buttons: x.buttons.map((y) => (y.id === b.id ? { ...y, targetId: t } : y)) } : x,
                    ),
                  }),
                )
              }
            />
          ))}
          <button
            onClick={() =>
              set({
                cards: [
                  ...node.cards,
                  { id: nanoid(8), title: `カード${node.cards.length + 1}`, text: "", imageId: null, buttons: [{ id: nanoid(8), label: "詳しく見る", targetId: null }] },
                ],
              })
            }
            className="w-full rounded-md border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            ＋ カードを追加
          </button>
        </section>
      )}

      <label className="block">
        <Label>{def.hasButtons || def.hasCards ? "続けて送るもの(任意)" : "次の遷移先"}</Label>
        <TargetSelect value={node.nextId} others={others} onChange={(v) => pickTarget(v, "next", (t) => set({ nextId: t }))} />
      </label>

      <section>
        <Label>イメージ画像・スクリーンショット</Label>
        <ImageDrop
          images={node.images}
          onAdd={(imgs) => addImages(node.id, imgs)}
          onRemove={(id) =>
            set({
              images: node.images.filter((i) => i.id !== id),
              cards: node.cards.map((c) => (c.imageId === id ? { ...c, imageId: null } : c)),
            })
          }
        />
      </section>

      <label className="block">
        <Label>メモ(お客様にも見えます)</Label>
        <textarea className={`${field} min-h-16 resize-y bg-yellow-50/50`} value={node.memo} onChange={(e) => set({ memo: e.target.value })} />
      </label>

      <button
        onClick={() => deleteNodes([node.id])}
        className="w-full rounded-md py-1.5 text-xs text-red-500 ring-1 ring-red-200 hover:bg-red-50"
      >
        このノードを削除
      </button>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-400">{text}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs font-bold text-slate-500">{children}</div>;
}

function TargetSelect({ value, others, onChange }: { value: string | null; others: FlowNode[]; onChange: (v: string) => void }) {
  const project = useCurrentProject()!;
  return (
    <select className={field} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">(なし)</option>
      <option value={NEW_NODE}>＋ 新しいノードを作ってつなぐ</option>
      {others.map((n) => (
        <option key={n.id} value={n.id}>
          {getKindDef(project.tool, n.kind).icon} {n.title || "(名前なし)"}
        </option>
      ))}
    </select>
  );
}

function ButtonsEditor({
  buttons,
  others,
  onChange,
  onPickTarget,
  addLabel,
}: {
  buttons: FlowButton[];
  others: FlowNode[];
  onChange: (b: FlowButton[]) => void;
  onPickTarget: (b: FlowButton, value: string) => void;
  addLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      {buttons.map((b, i) => (
        <div key={b.id} className="flex gap-1">
          <input
            className={`${field} w-[42%]`}
            value={b.label}
            placeholder="ボタンの文言"
            onChange={(e) => onChange(buttons.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))}
          />
          <div className="min-w-0 flex-1">
            <TargetSelect value={b.targetId} others={others} onChange={(v) => onPickTarget(b, v)} />
          </div>
          <button
            onClick={() => {
              if (i === 0) return;
              const next = [...buttons];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              onChange(next);
            }}
            disabled={i === 0}
            className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
            title="上へ"
          >
            ↑
          </button>
          <button onClick={() => onChange(buttons.filter((x) => x.id !== b.id))} className="px-1 text-slate-400 hover:text-red-500" title="削除">
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...buttons, { id: nanoid(8), label: `${addLabel}${buttons.length + 1}`, targetId: null }])}
        className="w-full rounded-md border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
      >
        ＋ 追加
      </button>
    </div>
  );
}

function CardEditor({
  card,
  index,
  node,
  others,
  onChange,
  onRemove,
  onPickTarget,
}: {
  card: CarouselCard;
  index: number;
  node: FlowNode;
  others: FlowNode[];
  onChange: (c: CarouselCard) => void;
  onRemove: () => void;
  onPickTarget: (b: FlowButton, value: string) => void;
}) {
  const addImages = useEditor((s) => s.addImages);
  const img = node.images.find((i) => i.id === card.imageId);
  const fileRef = useRef<HTMLInputElement>(null);

  const setImage = async (files: File[]) => {
    if (!files.length) return;
    const im = await readImage(files[0]);
    addImages(node.id, [im]);
    // addImages の後の最新状態に対して imageId を設定する
    const latest = useEditor.getState().nodes.find((n) => n.id === node.id);
    const latestCard = latest?.cards.find((c) => c.id === card.id) ?? card;
    useEditor.getState().updateNode(node.id, {
      cards: (latest?.cards ?? node.cards).map((c) => (c.id === card.id ? { ...latestCard, imageId: im.id } : c)),
    });
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/40 p-2">
      <div className="flex items-center justify-between text-xs font-bold text-amber-800">
        <span>カード {index + 1}</span>
        <button onClick={onRemove} className="text-slate-400 hover:text-red-500">
          削除
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setImage(imageFiles(e.dataTransfer.files));
          }}
          className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-amber-300 bg-white text-[10px] text-slate-400"
          title="クリックまたはドロップで画像を設定"
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt="" className="h-full w-full object-cover" />
          ) : (
            "画像を設定"
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setImage(imageFiles(e.target.files))} />
        <div className="flex-1 space-y-1">
          <input className={field} value={card.title} placeholder="タイトル" onChange={(e) => onChange({ ...card, title: e.target.value })} />
          <textarea className={`${field} min-h-10`} value={card.text} placeholder="説明文" onChange={(e) => onChange({ ...card, text: e.target.value })} />
        </div>
      </div>
      <ButtonsEditor
        buttons={card.buttons}
        others={others}
        onChange={(buttons) => onChange({ ...card, buttons })}
        onPickTarget={onPickTarget}
        addLabel="ボタン"
      />
    </div>
  );
}

function ImageDrop({ images, onAdd, onRemove }: { images: FlowImage[]; onAdd: (i: FlowImage[]) => void; onRemove: (id: string) => void }) {
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const handle = async (files: File[]) => {
    if (files.length) onAdd(await Promise.all(files.map((f) => readImage(f))));
  };
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((i) => (
            <div key={i.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.url} alt={i.name} className="aspect-square w-full rounded object-cover ring-1 ring-slate-200" />
              <button
                onClick={() => onRemove(i.id)}
                className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white group-hover:flex"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(imageFiles(e.dataTransfer.files));
        }}
        className={`w-full rounded-md border-2 border-dashed px-3 py-4 text-center text-xs ${
          over ? "border-[#06c755] bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"
        }`}
      >
        ここに画像をドロップ / クリックして選択
        <br />
        <span className="text-slate-400">スクショは Ctrl+V(Macは⌘+V)で貼り付けOK</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => handle(imageFiles(e.target.files))} />
    </div>
  );
}
