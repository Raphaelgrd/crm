// Accès aux modèles d'IA avec bascule automatique entre fournisseurs :
// Claude (si ANTHROPIC_API_KEY, API Messages, voir claude.ts) → Groq → Gemini → Mistral (gratuits, API « chat completions »).
// Ordre modifiable avec AI_PROVIDERS ; Claude reste en tête dès que sa clé est définie.
import { claudeErrorText, claudeModel, claudeTurn } from "./claude";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  /** Contenu brut d'un tour de Claude, à lui rendre tel quel (ignoré par les autres fournisseurs). */
  raw?: unknown;
}

export class LlmError extends Error {}

interface Provider {
  id: string;
  name: string;
  url: string;
  key: string;
  model: () => Promise<string>;
  /** Modèle capable de lire des images (null = fournisseur ignoré pour les requêtes avec images). */
  visionModel: () => Promise<string | null>;
}

let geminiModel: { id: string; at: number } | null = null;

/** Choisit le meilleur modèle « flash » stable disponible (les noms changent souvent chez Google). */
async function pickGeminiModel(key: string): Promise<string> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (geminiModel && Date.now() - geminiModel.at < 3_600_000) return geminiModel.id;
  let id = "gemini-2.5-flash";
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const { data } = (await res.json()) as { data: { id: string }[] };
      const candidates = data
        .map((m) => m.id.replace(/^models\//, ""))
        .filter((m) => /^gemini-\d+(\.\d+)?-flash$/.test(m))
        .sort((a, b) => parseFloat(b.slice(7)) - parseFloat(a.slice(7)));
      if (candidates[0]) id = candidates[0];
    }
  } catch {
    /* on garde le modèle par défaut */
  }
  geminiModel = { id, at: Date.now() };
  return id;
}

function providers(): Provider[] {
  const all: Record<string, Provider | null> = {
    claude: process.env.ANTHROPIC_API_KEY
      ? {
          id: "claude",
          name: "Claude",
          url: "",
          key: process.env.ANTHROPIC_API_KEY,
          model: async () => claudeModel(),
          visionModel: async () => claudeModel(),
        }
      : null,
    groq: process.env.GROQ_API_KEY
      ? {
          id: "groq",
          name: "Groq",
          url: "https://api.groq.com/openai/v1/chat/completions",
          key: process.env.GROQ_API_KEY,
          model: async () => process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
          visionModel: async () => process.env.GROQ_VISION_MODEL ?? null,
        }
      : null,
    gemini: process.env.GEMINI_API_KEY
      ? {
          id: "gemini",
          name: "Gemini",
          url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          key: process.env.GEMINI_API_KEY,
          model: () => pickGeminiModel(process.env.GEMINI_API_KEY!),
          visionModel: () => pickGeminiModel(process.env.GEMINI_API_KEY!),
        }
      : null,
    mistral: process.env.MISTRAL_API_KEY
      ? {
          id: "mistral",
          name: "Mistral",
          url: "https://api.mistral.ai/v1/chat/completions",
          key: process.env.MISTRAL_API_KEY,
          model: async () => process.env.MISTRAL_MODEL ?? "mistral-small-latest",
          visionModel: async () => process.env.MISTRAL_VISION_MODEL ?? "mistral-small-latest",
        }
      : null,
  };
  const order = (process.env.AI_PROVIDERS ?? "claude,groq,gemini,mistral").split(",").map((s) => s.trim().toLowerCase());
  if (!order.includes("claude")) order.unshift("claude");
  return order.map((n) => all[n]).filter((p): p is Provider => !!p);
}

const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();

/** Ids d'appels d'outils au format accepté par tous (Mistral exige 9 caractères alphanumériques). */
export function normalizeToolCalls(calls: ToolCall[] | undefined): ToolCall[] | undefined {
  return calls?.map((c) => ({
    ...c,
    type: "function",
    id: /^[a-zA-Z0-9]{9}$/.test(c.id ?? "") ? c.id : Math.random().toString(36).slice(2, 11).padEnd(9, "0"),
  }));
}

/** Ajoute les images (data URL) au dernier message utilisateur, au format attendu par chaque fournisseur. */
function withImages(wire: Record<string, unknown>[], images: string[], providerId: string) {
  const idx = wire.map((m) => m.role).lastIndexOf("user");
  if (idx < 0) return wire;
  const parts: unknown[] = [{ type: "text", text: String(wire[idx].content ?? "") }];
  for (const url of images) {
    parts.push(providerId === "mistral" ? { type: "image_url", image_url: url } : { type: "image_url", image_url: { url } });
  }
  return wire.map((m, i) => (i === idx ? { ...m, content: parts } : m));
}

function toWire(m: ChatMessage) {
  if (m.role === "assistant" && m.tool_calls?.length) {
    return { role: "assistant", content: m.content || "", tool_calls: m.tool_calls };
  }
  if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
  return { role: m.role, content: m.content };
}

export interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];
  /** Claude : contenu brut du tour, à renvoyer dans le message assistant suivant (champ `raw`). */
  raw?: unknown[];
  provider: number;
  providerName: string;
}

/**
 * Appelle le premier fournisseur disponible à partir de `startAt` ; en cas de limite atteinte,
 * de surcharge ou d'erreur du fournisseur, passe au suivant. `provider` permet de rester sur le même ensuite.
 */
export async function chatCompletion(opts: {
  messages: ChatMessage[];
  tools?: unknown[];
  maxTokens?: number;
  temperature?: number;
  startAt?: number;
  retried?: boolean;
  /** Images (data URL) jointes au dernier message utilisateur : seuls les fournisseurs « vision » sont utilisés. */
  images?: string[];
  /** Diagnostic : n'essayer que ce fournisseur (id). */
  only?: string;
}): Promise<ChatResult> {
  const list0 = opts.images?.length ? (await Promise.all(providers().map(async (p) => ((await p.visionModel()) ? p : null)))).filter((p): p is Provider => !!p) : providers();
  const list = opts.only ? list0.filter((p) => p.id === opts.only) : list0;
  if (!list.length) {
    throw new LlmError(
      opts.images?.length
        ? "Aucune IA capable de lire des images n'est configurée (GEMINI_API_KEY ou MISTRAL_API_KEY)."
        : "Aucune clé d'IA configurée (GROQ_API_KEY, GEMINI_API_KEY ou MISTRAL_API_KEY).",
    );
  }
  const errors: string[] = [];
  let shortestWait = Infinity;

  for (let i = opts.startAt ?? 0; i < list.length; i++) {
    const p = list[i];
    if (p.id === "claude") {
      try {
        const r = await claudeTurn({ messages: opts.messages, tools: opts.tools, images: opts.images });
        console.info(`[llm] Claude ${claudeModel()} : ${r.usage.input} jetons lus (+${r.usage.cacheRead} en cache), ${r.usage.output} écrits`);
        return { content: r.content, toolCalls: r.toolCalls, raw: r.raw, provider: i, providerName: p.name };
      } catch (e) {
        const { text, wait } = claudeErrorText(e);
        if (wait !== undefined) shortestWait = Math.min(shortestWait, wait);
        errors.push(text);
        continue;
      }
    }
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: opts.images?.length ? await p.visionModel() : await p.model(),
          messages: opts.images?.length ? withImages(opts.messages.map(toWire), opts.images, p.id) : opts.messages.map(toWire),
          ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" } : {}),
          max_tokens: opts.maxTokens ?? 2000,
          temperature: opts.temperature ?? 0.3,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const text = await res.text();
        const wait = Number(/try again in ([\d.]+)s/i.exec(text)?.[1] ?? res.headers.get("retry-after") ?? NaN);
        if (res.status === 429 && Number.isFinite(wait)) shortestWait = Math.min(shortestWait, wait);
        // Saturation passagère sans délai indiqué (Gemini « high demand », Mistral « rate limit ») : on réessaiera dans quelques secondes.
        // « Request too large » ne se corrige pas en attendant.
        else if ((res.status === 429 || res.status === 503) && !/too large/i.test(text)) shortestWait = Math.min(shortestWait, 4);
        errors.push(`${p.name} ${res.status}: ${text.slice(0, 160)}`);
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
      };
      const msg = data.choices?.[0]?.message;
      if (!msg) {
        errors.push(`${p.name}: réponse vide`);
        continue;
      }
      return {
        content: stripThinking(msg.content ?? ""),
        toolCalls: msg.tool_calls?.length ? normalizeToolCalls(msg.tool_calls) : undefined,
        provider: i,
        providerName: p.name,
      };
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Tout le monde est saturé : on attend le délai le plus court demandé, une seule fois.
  if (!opts.retried && Number.isFinite(shortestWait) && shortestWait <= 30) {
    await new Promise((r) => setTimeout(r, Math.ceil(shortestWait * 1000) + 500));
    return chatCompletion({ ...opts, retried: true });
  }
  console.error("[llm]", errors.join(" | "));
  // Raison de chaque service (code HTTP + début du message, sans clé) pour comprendre l'échec sans ouvrir les journaux.
  const detail = errors.map((e) => e.replace(/\s+/g, " ").slice(0, 110)).join(" · ");
  throw new LlmError(`L'IA n'a pas pu répondre (tous les services ont échoué). Détail : ${detail}`);
}

/** Paramètres → « Tester les IA » : une courte question à chaque fournisseur configuré, séparément. */
export async function testProviders() {
  const out: { id: string; name: string; model: string; ok: boolean; ms: number; detail: string }[] = [];
  for (const p of providers()) {
    const t0 = Date.now();
    let model = "?";
    try {
      model = await p.model();
    } catch {}
    try {
      const r = await chatCompletion({
        messages: [{ role: "user", content: "Test de connexion du CRM Netforce : réponds seulement « OK »." }],
        maxTokens: 50,
        only: p.id,
        retried: true,
      });
      out.push({ id: p.id, name: p.name, model, ok: true, ms: Date.now() - t0, detail: r.content.slice(0, 80) });
    } catch (e) {
      out.push({ id: p.id, name: p.name, model, ok: false, ms: Date.now() - t0, detail: (e instanceof Error ? e.message : String(e)).replace(/^.*Détail : /, "").slice(0, 300) });
    }
  }
  return out;
}
