import "server-only";
import { headers } from "next/headers";

/** いま開かれているURLの先頭部分(https://〜.vercel.app) */
export async function currentOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function googleRedirectUri() {
  return `${await currentOrigin()}/api/google/callback`;
}
