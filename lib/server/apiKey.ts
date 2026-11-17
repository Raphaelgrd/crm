import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Clé d'API via Bearer, x-api-key ou ?key=. Par défaut CRM_API_KEY (plusieurs valeurs séparées par des virgules) ;
 * `envNames` permet d'accepter d'autres variables (ex. CHATGPT_API_KEY, réservée au serveur MCP).
 */
export function apiKeyOk(
  req: NextRequest,
  opts: { allowBearer?: boolean; allowQuery?: boolean; envNames?: string[] } = {},
): boolean {
  const expected = (opts.envNames ?? ["CRM_API_KEY"])
    .flatMap((n) => (process.env[n] ?? "").split(","))
    .map((k) => k.trim())
    .filter(Boolean);
  if (!expected.length) return false;
  const auth = req.headers.get("authorization") ?? "";
  const given =
    (opts.allowBearer !== false && auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "") ||
    req.headers.get("x-api-key")?.trim() ||
    (opts.allowQuery ? req.nextUrl.searchParams.get("key")?.trim() : "") ||
    "";
  return !!given && expected.some((k) => safeEqual(k, given));
}
