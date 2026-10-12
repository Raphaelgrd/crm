import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { title, date, participants, transcript, summary, decisions } = await req.json() as {
    title: string;
    date: string;
    participants: string[];
    transcript: string;
    summary: string;
    decisions: string[];
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Clé GROQ_API_KEY manquante." }, { status: 500 });
  }

  const hasTranscript = transcript?.trim().length > 0;

  const context = `Titre : ${title}
Date : ${date}
Participants : ${participants.join(", ") || "—"}
${summary ? `Résumé existant : ${summary}` : ""}
${decisions.length ? `Décisions existantes : ${decisions.join(" | ")}` : ""}
${hasTranscript ? `\nTranscription :\n${transcript.slice(0, 6000)}` : ""}`;

  const systemPrompt = `Tu es un assistant expert en compte rendu de réunion. Tu analyses une réunion et tu retournes un JSON structuré.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication.
Format attendu :
{
  "summary": "Résumé concis de la réunion en 3-5 phrases",
  "decisions": ["Décision 1", "Décision 2"],
  "tasks": [
    { "description": "Description de la tâche", "assigneeName": "Prénom ou vide si inconnu" }
  ]
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context },
        ],
        max_tokens: 800,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Groq indisponible : ${err}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const raw = data.choices[0]?.message?.content ?? "{}";

    const parsed = JSON.parse(raw) as {
      summary?: string;
      decisions?: string[];
      tasks?: { description: string; assigneeName?: string }[];
    };

    return Response.json({
      summary: parsed.summary ?? "",
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    });
  } catch (e) {
    const msg = e instanceof SyntaxError ? "Réponse IA invalide, réessaie." : "Impossible de joindre Groq.";
    return Response.json({ error: msg }, { status: 503 });
  }
}
