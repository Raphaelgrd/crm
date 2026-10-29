export class GroqError extends Error {}

/** Appel Groq (chat completions), même modèle que le reste du CRM. `json: true` renvoie l'objet JSON de la réponse. */
export async function groqChat(opts: {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqError("Clé GROQ_API_KEY manquante.");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_tokens: Math.max(opts.maxTokens ?? 600, 1500),
      temperature: opts.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new GroqError(`Groq indisponible : ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = (data.choices[0]?.message?.content ?? "").replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
  if (!opts.json) return text;
  // Pas de mode JSON forcé (non garanti selon le modèle) : on extrait l'objet de la réponse.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new GroqError("Réponse IA illisible, réessaie.");
  return text.slice(start, end + 1);
}
