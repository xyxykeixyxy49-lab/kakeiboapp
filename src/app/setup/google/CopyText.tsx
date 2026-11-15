"use client";

import { useState } from "react";

export default function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded bg-slate-100 px-2 py-1.5 text-xs">{text}</code>
      <button
        onClick={() => navigator.clipboard.writeText(text).then(() => setDone(true))}
        className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
      >
        {done ? "コピー済み" : "コピー"}
      </button>
    </div>
  );
}
