import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { ChatMessage, LlmError, chatCompletion } from "@/lib/server/llm";

// IA des agents du Siège : relaie une conversation (avec outils exécutés dans la page) vers les modèles du CRM.
export const runtime = "nodejs";
// Claude peut réfléchir une minute ou plus sur un livrable : marge large.
export const maxDuration = 300;

const hasKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.MISTRAL_API_KEY);

export async function GET(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  return Response.json({ ok: hasKey() });
}

export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const body = (await req.json().catch(() => null)) as { messages?: ChatMessage[]; tools?: unknown[]; maxTokens?: number } | null;
  if (!body?.messages?.length) return Response.json({ code: "bad_request" }, { status: 400 });
  try {
    const r = await chatCompletion({ messages: body.messages, tools: body.tools, maxTokens: Math.min(body.maxTokens ?? 4000, 8000), temperature: 0.4 });
    // `raw` (Claude) : la page le renvoie avec le message assistant au tour suivant.
    return Response.json({ content: r.content, toolCalls: r.toolCalls ?? [], raw: r.raw ?? null, provider: r.providerName });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const limited = e instanceof LlmError && /429|limite|rate/i.test(msg);
    return Response.json({ code: limited ? "rate_limited" : "upstream_error", message: msg }, { status: limited ? 429 : 502 });
  }
}
