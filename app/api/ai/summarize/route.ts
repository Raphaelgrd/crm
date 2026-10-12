import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { contact, activities } = await req.json() as {
    contact: Record<string, unknown>;
    activities: { type: string; text: string; at: string }[];
  };

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  const actLog = activities.length
    ? activities
        .slice(0, 20)
        .map((a) => `- [${a.type}] ${a.text}`)
        .join("\n")
    : "Aucune activité enregistrée.";

  const prompt = `Tu es un assistant CRM. Génère une synthèse concise (4-6 phrases max) de ce contact en français.

Contact : ${name as string}
Société : ${(contact.company as string) || "—"}
Catégorie : ${(contact.category as string) || "—"}
Étape pipeline : ${contact.stage as string}
Email : ${(contact.email as string) || "—"}
Téléphone : ${(contact.phone as string) || "—"}
Tags : ${((contact.tags as string[]) ?? []).join(", ") || "—"}
Notes : ${(contact.notes as string) || "Aucune"}
Prochaine relance : ${(contact.nextFollowUpAt as string) || "Non planifiée"}

Activités récentes :
${actLog}

Synthèse (sois direct, pas de titre, pas de liste, juste un paragraphe) :`;

  const ollamaBase = process.env.OLLAMA_URL ?? "http://localhost:11434";

  try {
    const res = await fetch(`${ollamaBase}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1:8b",
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return Response.json({ error: "Ollama indisponible" }, { status: 502 });
    }

    const data = await res.json() as { response: string };
    return Response.json({ summary: data.response.trim() });
  } catch {
    return Response.json(
      { error: `Impossible de joindre Ollama (${ollamaBase}). Vérifie que le serveur tourne (ollama serve) ou configure OLLAMA_URL dans .env.local.` },
      { status: 503 },
    );
  }
}
