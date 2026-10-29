import { LlmError, chatCompletion } from "./llm";

export { LlmError as GroqError };

/** Appel texte simple (résumés, pointage…) avec bascule entre fournisseurs. `json: true` renvoie l'objet JSON de la réponse. */
export async function groqChat(opts: {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const { content: text } = await chatCompletion({
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    maxTokens: Math.max(opts.maxTokens ?? 600, 1500),
    temperature: opts.temperature ?? 0.3,
  });
  if (!opts.json) return text;
  // Pas de mode JSON forcé (non garanti selon le modèle) : on extrait l'objet de la réponse.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmError("Réponse IA illisible, réessaie.");
  return text.slice(start, end + 1);
}
