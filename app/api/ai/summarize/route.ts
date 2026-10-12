import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { contact, activities } = await req.json() as {
    contact: Record<string, unknown>;
    activities: { type: string; text: string; at: string }[];
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Clé GROQ_API_KEY manquante dans les variables d'environnement." }, { status: 500 });
  }

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  const actLog = activities.length
    ? activities
        .slice(0, 20)
        .map((a) => `- [${a.type}] ${a.text}`)
        .join("\n")
    : "Aucune activité enregistrée.";

  const userPrompt = `Contact : ${name as string}
Société : ${(contact.company as string) || "—"}
Catégorie : ${(contact.category as string) || "—"}
Étape pipeline : ${contact.stage as string}
Email : ${(contact.email as string) || "—"}
Téléphone : ${(contact.phone as string) || "—"}
Tags : ${((contact.tags as string[]) ?? []).join(", ") || "—"}
Notes : ${(contact.notes as string) || "Aucune"}
Prochaine relance : ${(contact.nextFollowUpAt as string) || "Non planifiée"}

Activités récentes :
${actLog}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "Tu es un assistant CRM. Génère une synthèse concise (4-6 phrases max) d'un contact en français. Sois direct, pas de titre, pas de liste, juste un paragraphe.",
          },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Groq indisponible : ${err}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const summary = data.choices[0]?.message?.content?.trim() ?? "";
    return Response.json({ summary });
  } catch {
    return Response.json(
      { error: "Impossible de joindre Groq. Vérifie ta connexion et la clé API." },
      { status: 503 },
    );
  }
}
