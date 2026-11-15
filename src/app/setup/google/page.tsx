import { isAdmin } from "@/lib/server/auth";
import { driveEnabled, oauthConfigured } from "@/lib/server/drive";
import { currentOrigin, googleRedirectUri } from "@/lib/server/origin";
import CopyText from "./CopyText";

export const dynamic = "force-dynamic";
export const metadata = { title: "Googleドライブの設定 | LINE構成デザイナー" };

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-lg border p-4 ${done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
      <h2 className="flex items-center gap-2 font-bold">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${done ? "bg-emerald-500" : "bg-slate-400"}`}>
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm text-slate-700">{children}</div>
    </section>
  );
}

/** Googleドライブ連携の設定画面(管理者のみ) */
export default async function GoogleSetupPage() {
  if (!(await isAdmin()))
    return (
      <main className="mx-auto max-w-xl p-6 text-sm">
        先に <a className="text-blue-600 underline" href="/">アプリ</a> でログインしてから、この画面を開いてください。
      </main>
    );
  const origin = await currentOrigin();
  const redirect = await googleRedirectUri();
  const client = oauthConfigured();
  const ready = driveEnabled();

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Googleドライブの設定</h1>
        <a href="/" className="text-sm text-blue-600 underline">
          アプリに戻る
        </a>
      </div>
      <p className="text-sm text-slate-600">
        画像・スクリーンショットを、あなたのGoogleドライブの「LINE構成デザイナー」フォルダに保存するための設定です。
        アプリが触れるのは、アプリ自身が作ったファイルだけです。
      </p>

      <Step n={1} done={client} title="Google Cloud で OAuthクライアントを作り、Vercelに登録">
        <p>作るときに「承認済みのリダイレクト URI」に次のURLを追加してください:</p>
        <CopyText text={redirect} />
        <p>「承認済みの JavaScript 生成元」には次のURL:</p>
        <CopyText text={origin} />
        <p>
          できたら Vercel に <code>GOOGLE_CLIENT_ID</code> と <code>GOOGLE_CLIENT_SECRET</code> を登録して Redeploy。
        </p>
        <p className={client ? "text-emerald-700" : "text-amber-700"}>
          {client ? "✓ 登録を確認できました" : "まだ登録されていません"}
        </p>
      </Step>

      <Step n={2} done={ready} title="Googleで許可して、表示された値をVercelに登録">
        {client ? (
          <>
            <a
              href="/api/google/auth"
              className="inline-block rounded-md bg-[#06c755] px-4 py-2 font-semibold text-white hover:bg-[#05b34c]"
            >
              Googleで許可
            </a>
            <p>許可すると値が表示されるので、Vercel に <code>GOOGLE_REFRESH_TOKEN</code> として登録して Redeploy します。</p>
          </>
        ) : (
          <p className="text-slate-400">手順1が終わると押せるようになります</p>
        )}
        <p className={ready ? "text-emerald-700" : "text-amber-700"}>
          {ready ? "✓ 設定済み。画像はGoogleドライブに保存されます" : "まだ設定されていません"}
        </p>
      </Step>
    </main>
  );
}
