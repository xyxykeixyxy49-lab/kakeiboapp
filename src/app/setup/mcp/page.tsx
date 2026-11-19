import { isAdmin, mcpToken } from "@/lib/server/auth";
import { notionEnabled } from "@/lib/server/notion";
import { currentOrigin } from "@/lib/server/origin";
import CopyText from "../google/CopyText";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claudeとの接続(MCP) | LINE構成デザイナー" };

/** Claude に登録する MCP のURLを表示する(管理者のみ) */
export default async function McpSetupPage() {
  if (!(await isAdmin()))
    return (
      <main className="mx-auto max-w-xl p-6 text-sm">
        先に <a className="text-blue-600 underline" href="/">アプリ</a> でログインしてから、この画面を開いてください。
      </main>
    );
  const token = mcpToken();
  const url = token ? `${await currentOrigin()}/api/mcp/${token}` : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Claudeとの接続(MCP)</h1>
        <a href="/" className="text-sm text-blue-600 underline">
          アプリに戻る
        </a>
      </div>
      <p className="text-sm text-slate-600">
        Claude に下のURLを「カスタムコネクタ」として登録すると、会話から案件の構成を見たり、ノードや分岐を追加したりできます。
      </p>
      {!notionEnabled() || !url ? (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Notion と管理者パスワードの設定が済むと使えるようになります。</p>
      ) : (
        <>
          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-bold">登録するURL</h2>
            <CopyText text={url} />
            <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              ⚠️ このURLは合言葉入りです。知っている人は誰でも構成を編集できるので、他の人に教えないでください。
              管理者パスワードを変えると、URLも変わります(古いURLは使えなくなります)。
            </p>
          </section>
          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="font-bold">claude.ai での登録手順</h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>claude.ai の「設定」→「コネクタ」を開く</li>
              <li>「カスタムコネクタを追加」を押す</li>
              <li>名前に「LINE構成デザイナー」、URLに上のURLを貼り付けて「追加」</li>
              <li>会話の入力欄の「＋」(ツール)から LINE構成デザイナー がオンになっていることを確認</li>
            </ol>
            <h2 className="pt-2 font-bold">頼み方の例</h2>
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              <li>「LINE構成デザイナーの案件一覧を見せて」</li>
              <li>「美容サロンの案件の流れを文章でまとめて」</li>
              <li>「ご用件の確認に『キャンセルしたい』の分岐を足して、キャンセル受付のメッセージを作って」</li>
              <li>「新しくカフェの案件をLメッセージで作って、友だち追加→アンケート→クーポンの流れを組んで」</li>
            </ul>
            <p className="text-xs text-slate-500">
              Claude が編集した内容は Notion に保存されます。アプリを開いている場合は、再読み込みすると反映されます。
            </p>
          </section>
        </>
      )}
    </main>
  );
}
