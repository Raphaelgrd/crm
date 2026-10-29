import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { GroqError, groqChat } from "@/lib/server/groq";
import { SUMMARY_SYSTEM, activityText, type TrackerDoc } from "@/lib/server/activityText";

export const runtime = "nodejs";

// Résumé IA de la journée d'une personne (page Équipe, réservée aux admins).
export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Réservé aux admins." }, { status: 403 });

  const { doc, name } = (await req.json()) as { doc: TrackerDoc; name?: string };
  const data = activityText(doc ?? {});
  try {
    const summary = await groqChat({
      system: SUMMARY_SYSTEM,
      user: `Personne : ${name || "membre de l'équipe"}\nDate : ${doc?.date ?? ""}\n\n${data}`,
      maxTokens: 350,
    });
    return Response.json({ summary });
  } catch (e) {
    return Response.json({ error: e instanceof GroqError ? e.message : "Résumé impossible." }, { status: 502 });
  }
}
