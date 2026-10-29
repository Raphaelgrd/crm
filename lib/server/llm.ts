// Accès aux modèles d'IA avec bascule automatique entre fournisseurs gratuits :
// Groq → Gemini → Mistral (ordre modifiable avec AI_PROVIDERS). Tous exposent l'API « chat completions ».

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
}

export class LlmError extends Error {}

interface Provider {
  name: string;
  url: string;
  key: string;
  model: () => Promise<string>;
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
    groq: process.env.GROQ_API_KEY
      ? {
          name: "Groq",
          url: "https://api.groq.com/openai/v1/chat/completions",
          key: process.env.GROQ_API_KEY,
          model: async () => process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
        }
      : null,
    gemini: process.env.GEMINI_API_KEY
      ? {
          name: "Gemini",
          url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          key: process.env.GEMINI_API_KEY,
          model: () => pickGeminiModel(process.env.GEMINI_API_KEY!),
        }
      : null,
    mistral: process.env.MISTRAL_API_KEY
      ? {
          name: "Mistral",
          url: "https://api.mistral.ai/v1/chat/completions",
          key: process.env.MISTRAL_API_KEY,
          model: async () => process.env.MISTRAL_MODEL ?? "mistral-small-latest",
        }
      : null,
  };
  const order = (process.env.AI_PROVIDERS ?? "groq,gemini,mistral").split(",").map((s) => s.trim().toLowerCase());
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
}): Promise<ChatResult> {
  const list = providers();
  if (!list.length) throw new LlmError("Aucune clé d'IA configurée (GROQ_API_KEY, GEMINI_API_KEY ou MISTRAL_API_KEY).");
  const errors: string[] = [];
  let shortestWait = Infinity;

  for (let i = opts.startAt ?? 0; i < list.length; i++) {
    const p = list[i];
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: await p.model(),
          messages: opts.messages.map(toWire),
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
  throw new LlmError("L'IA est momentanément saturée sur tous les services gratuits. Réessaie dans une minute.");
}
