// Claude (API Anthropic), premier choix de l'IA du CRM quand ANTHROPIC_API_KEY est définie.
// Le reste du CRM parle le format « chat completions » (messages user / assistant / tool + tool_calls) :
// ce module le traduit pour l'API Messages, et renvoie le contenu brut de Claude (`raw`) pour qu'il lui soit
// rendu tel quel au tour suivant (ses blocs de réflexion doivent revenir intacts dans une boucle d'outils).
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ToolCall } from "./llm";

/** Modèle du quotidien (Haiku : rapide, quelques centimes par mois) et modèle « premium » (Opus, sur demande d'un admin). */
export const claudeModel = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
export const claudePremiumModel = () => process.env.ANTHROPIC_PREMIUM_MODEL?.trim() || "claude-opus-5-5";
/** Le relais côté API en cas de refus n'existe que sur Opus, Sonnet et Fable (pas sur Haiku). */
const hasServerFallback = (model: string) => /^claude-(opus|sonnet|fable)-5/.test(model);
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const claudeEffort = (): Effort => {
  const e = process.env.ANTHROPIC_EFFORT?.trim().toLowerCase() as Effort | undefined;
  return e && EFFORTS.includes(e) ? e : "medium";
};

let client: Anthropic | null = null;
const getClient = () =>
  (client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Les autres fournisseurs prennent le relais en cas d'échec : pas de nouvelle tentative ici.
    maxRetries: 0,
    timeout: 110_000,
  }));

/** Blocs de Claude qu'on accepte de lui renvoyer (contenu d'un tour précédent, relayé par la page). */
const REPLAYABLE = new Set(["text", "thinking", "redacted_thinking", "tool_use", "fallback"]);
export function sanitizeRaw(raw: unknown): Anthropic.Beta.BetaContentBlockParam[] | undefined {
  if (!Array.isArray(raw) || !raw.length || raw.length > 200) return undefined;
  if (!raw.every((b) => b && typeof b === "object" && REPLAYABLE.has(String((b as { type?: unknown }).type)))) return undefined;
  if (JSON.stringify(raw).length > 400_000) return undefined;
  return raw as Anthropic.Beta.BetaContentBlockParam[];
}

const parseArgs = (s: string): Record<string, unknown> => {
  try {
    const v = s ? JSON.parse(s) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

/** Images en data URL → blocs image (base64). */
function imageBlocks(images: string[]): Anthropic.Beta.BetaImageBlockParam[] {
  const out: Anthropic.Beta.BetaImageBlockParam[] = [];
  for (const url of images) {
    const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(url);
    if (m) out.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/png", data: m[2] } });
  }
  return out;
}

/** Conversation du CRM → (system, messages) de l'API Messages. Traduction déterministe : même entrée, même requête. */
export function toAnthropic(messages: ChatMessage[], images?: string[]) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).filter(Boolean).join("\n\n");
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  const push = (role: "user" | "assistant", blocks: Anthropic.Beta.BetaContentBlockParam[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      push("user", [{ type: "tool_result", tool_use_id: m.tool_call_id || "inconnu", content: m.content || "(vide)" }]);
    } else if (m.role === "assistant") {
      const raw = sanitizeRaw(m.raw);
      if (raw) push("assistant", raw);
      else {
        const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (m.content?.trim()) blocks.push({ type: "text", text: m.content });
        for (const c of m.tool_calls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) });
        push("assistant", blocks);
      }
    } else if (m.content?.trim()) {
      push("user", [{ type: "text", text: m.content }]);
    }
  }
  // Images : jointes au dernier message de l'utilisateur.
  if (images?.length) {
    const idx = out.map((m) => m.role).lastIndexOf("user");
    if (idx >= 0 && Array.isArray(out[idx].content)) (out[idx].content as Anthropic.Beta.BetaContentBlockParam[]).unshift(...imageBlocks(images));
  }
  // L'API attend un premier message de l'utilisateur.
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: [{ type: "text", text: "Bonjour." }] });
  return { system, messages: out };
}

/** Outils au format « chat completions » → outils de l'API Messages. */
export function toAnthropicTools(tools: unknown[] | undefined): Anthropic.Beta.BetaTool[] {
  const out: Anthropic.Beta.BetaTool[] = [];
  for (const t of tools ?? []) {
    const f = (t as { function?: { name?: string; description?: string; parameters?: Record<string, unknown> } })?.function;
    if (!f?.name) continue;
    const schema = f.parameters && f.parameters.type === "object" ? f.parameters : { type: "object", properties: {} };
    out.push({ name: f.name, description: f.description ?? "", input_schema: schema as Anthropic.Beta.BetaTool.InputSchema });
  }
  return out;
}

export class ClaudeRefusal extends Error {}

export interface ClaudeReply {
  content: string;
  toolCalls?: ToolCall[];
  raw: unknown[];
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** Un tour de Claude. Lève une erreur (typée par le SDK) si l'API refuse ou échoue : le fournisseur suivant prend le relais. */
export async function claudeTurn(opts: { messages: ChatMessage[]; tools?: unknown[]; images?: string[]; premium?: boolean }): Promise<ClaudeReply> {
  const { system, messages } = toAnthropic(opts.messages, opts.images);
  const tools = toAnthropicTools(opts.tools);
  const model = opts.premium ? claudePremiumModel() : claudeModel();
  const res = await getClient().beta.messages.create({
    model,
    max_tokens: 16_000,
    ...(system ? { system } : {}),
    messages,
    ...(tools.length ? { tools } : {}),
    thinking: { type: "adaptive" },
    output_config: { effort: claudeEffort() },
    // Le préfixe (consignes, outils, début de conversation) est mis en cache : les tours suivants coûtent moins cher.
    cache_control: { type: "ephemeral" },
    // Si Claude décline une demande pour raison de sécurité, l'API la confie elle-même à un autre modèle Claude.
    ...(hasServerFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  if (res.stop_reason === "refusal") throw new ClaudeRefusal(`Claude a décliné la demande (${res.stop_details?.category ?? "sans catégorie"}).`);
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const b of res.content) {
    if (b.type === "text") text += (text ? "\n\n" : "") + b.text;
    if (b.type === "tool_use") toolCalls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
  }
  if (!text.trim() && !toolCalls.length) throw new Error(`réponse vide (${res.stop_reason ?? "?"})`);
  const u = res.usage;
  return {
    content: text.trim(),
    toolCalls: toolCalls.length ? toolCalls : undefined,
    raw: res.content as unknown[],
    model: res.model || model,
    usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
  };
}

/** Message d'erreur lisible, sans clé, avec le code HTTP quand il y en a un. */
export function claudeErrorText(e: unknown): { text: string; wait?: number } {
  if (e instanceof Anthropic.AuthenticationError) return { text: "Claude 401: clé ANTHROPIC_API_KEY refusée (vérifie-la sur Vercel)" };
  if (e instanceof Anthropic.PermissionDeniedError) return { text: "Claude 403: accès refusé (crédit épuisé ou modèle non autorisé)" };
  if (e instanceof Anthropic.RateLimitError) {
    const wait = Number(e.headers?.get?.("retry-after") ?? NaN);
    return { text: `Claude 429: ${e.message.slice(0, 140)}`, wait: Number.isFinite(wait) ? wait : 4 };
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? "réseau";
    return { text: `Claude ${status}: ${e.message.slice(0, 140)}`, wait: status === 529 || status === 503 ? 4 : undefined };
  }
  return { text: `Claude: ${e instanceof Error ? e.message : String(e)}` };
}
