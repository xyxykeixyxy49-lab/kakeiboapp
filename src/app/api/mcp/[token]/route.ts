import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";
import { checkMcpToken } from "@/lib/server/auth";
import { buildMcpServer } from "@/lib/server/mcp";
import { notionEnabled } from "@/lib/server/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };

/**
 * Claude から呼ばれる MCP の入口。URLに合言葉が入っている(/api/mcp/<合言葉>)。
 * 1回のリクエストごとにサーバーを作る「状態を持たない」方式(Vercel向け)。
 */
async function handle(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!checkMcpToken(token)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!notionEnabled()) return NextResponse.json({ error: "Notionが設定されていません" }, { status: 503 });
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // 応答を返したら片付ける
    setTimeout(() => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    }, 0);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
