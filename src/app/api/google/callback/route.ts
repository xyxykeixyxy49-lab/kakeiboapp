import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { exchangeCode } from "@/lib/server/drive";
import { googleRedirectUri } from "@/lib/server/origin";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,"Hiragino Sans",sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#0f172a}
main{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px #0001}
h1{font-size:20px}code,textarea{font-family:ui-monospace,monospace}textarea{width:100%;height:90px;font-size:13px;padding:8px;box-sizing:border-box}
button{background:#06c755;color:#fff;border:0;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer}
ol li{margin:6px 0}.warn{background:#fef3c7;padding:8px 12px;border-radius:6px;font-size:14px}a{color:#2563eb}</style></head>
<body><main>${body}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

/** Googleの許可画面から戻ってくる場所。リフレッシュトークンを表示して、Vercelへの登録方法を案内する */
export async function GET(req: Request) {
  if (!(await isAdmin())) return page("ログインが必要です", "<h1>ログインが必要です</h1><p>アプリにログインしてからやり直してください。</p>");
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) return page("許可されませんでした", `<h1>許可されませんでした</h1><p>${esc(err)}</p><p><a href="/setup/google">戻る</a></p>`);
  const state = (await cookies()).get("lfd_oauth_state")?.value;
  if (!state || state !== url.searchParams.get("state"))
    return page("やり直してください", `<h1>やり直してください</h1><p>時間が経ちすぎたか、別の画面から開かれました。</p><p><a href="/setup/google">戻る</a></p>`);
  try {
    const tok = await exchangeCode(url.searchParams.get("code") ?? "", await googleRedirectUri());
    if (!tok.refresh_token)
      return page(
        "もう一度お願いします",
        `<h1>もう一度お願いします</h1><p>Googleから必要な値が返ってきませんでした。<a href="https://myaccount.google.com/connections" target="_blank">Googleアカウントの「サードパーティ製のアプリとサービス」</a>でこのアプリの許可を削除してから、<a href="/setup/google">設定画面</a>でもう一度「Googleで許可」を押してください。</p>`,
      );
    const res = page(
      "Googleドライブの許可ができました",
      `<h1>✅ 許可できました</h1>
<p>下の値を Vercel に登録すると、画像がGoogleドライブに保存されるようになります。</p>
<p class="warn">⚠️ この値は合言葉と同じです。チャットやスクショに載せず、Vercelにだけ貼り付けてください。</p>
<textarea id="t" readonly>${esc(tok.refresh_token)}</textarea>
<p><button onclick="navigator.clipboard.writeText(document.getElementById('t').value).then(()=>this.textContent='コピーしました')">コピー</button></p>
<ol>
<li>Vercel の「Settings → Environment Variables」を開く</li>
<li>Key に <code>GOOGLE_REFRESH_TOKEN</code>、Value に上の値を貼り付け(Type は Secret)</li>
<li>Environments は他の値と同じ(Production と Preview のこのブランチ)にして Save</li>
<li>「Deployments」から最新の行を Redeploy(Environment は Preview)</li>
</ol>
<p><a href="/">アプリに戻る</a></p>`,
    );
    res.cookies.delete("lfd_oauth_state");
    return res;
  } catch (e) {
    return page("うまくいきませんでした", `<h1>うまくいきませんでした</h1><p>${esc((e as Error).message)}</p><p><a href="/setup/google">戻る</a></p>`);
  }
}
