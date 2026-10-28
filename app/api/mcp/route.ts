import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { TOOLS, callTool } from "@/lib/server/mcpTools";

// Serveur MCP (transport « Streamable HTTP », réponses JSON sans SSE) :
// permet à Claude, ChatGPT ou tout client MCP de lire et modifier le CRM.
// Clé : CRM_API_KEY (Vercel), passée en `Authorization: Bearer`, `x-api-key` ou `?key=`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key, Mcp-Session-Id, Mcp-Protocol-Version",
};

const INSTRUCTIONS = `CRM de Netforce (gants de protection pour forces de l'ordre et défense).
Données : contacts (pipeline commercial et levée de fonds), organisations, agenda, comptes rendus de réunion, prêts/envois de gants, stock, dossiers de la Data Room, activité de l'équipe et rapport d'heures.
Avant de créer un contact, cherche-le avec search_contacts pour éviter les doublons. Les dates sont au format YYYY-MM-DD.`;

type JsonRpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function keyOk(req: NextRequest): boolean {
  const expected = (process.env.CRM_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (!expected.length) return false;
  const auth = req.headers.get("authorization") ?? "";
  const given =
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "") ||
    req.headers.get("x-api-key")?.trim() ||
    req.nextUrl.searchParams.get("key")?.trim() ||
    "";
  if (!given) return false;
  const g = Buffer.from(given);
  return expected.some((k) => {
    const e = Buffer.from(k);
    return e.length === g.length && timingSafeEqual(e, g);
  });
}

const ok = (id: JsonRpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: JsonRpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg: JsonRpc) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize": {
      const requested = String(params?.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "netforce-crm", title: "CRM Netforce", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })),
      });
    case "tools/call": {
      const name = String(params?.name ?? "");
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      const r = await callTool(name, args);
      return ok(id, { content: [{ type: "text", text: r.text }], isError: r.isError });
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return err(id, -32601, `Méthode non supportée : ${method}`);
  }
}

export async function POST(req: NextRequest) {
  if (!keyOk(req)) {
    return Response.json(err(null, -32001, "Clé API invalide ou manquante"), { status: 401, headers: CORS });
  }
  let body: JsonRpc | JsonRpc[];
  try {
    body = (await req.json()) as JsonRpc | JsonRpc[];
  } catch {
    return Response.json(err(null, -32700, "JSON invalide"), { status: 400, headers: CORS });
  }
  const messages = Array.isArray(body) ? body : [body];
  const requests = messages.filter((m) => m.id !== undefined && m.id !== null && m.method);
  if (!requests.length) return new Response(null, { status: 202, headers: CORS });

  const responses = await Promise.all(requests.map(handle));
  return Response.json(Array.isArray(body) ? responses : responses[0], { headers: CORS });
}

export async function GET() {
  return new Response("Ce serveur MCP n'ouvre pas de flux SSE : utilise POST.", {
    status: 405,
    headers: { ...CORS, Allow: "POST, OPTIONS" },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
