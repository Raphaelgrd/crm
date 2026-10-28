import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";

const STRUCTURAL_VARS: Record<string, (c: Record<string, string>) => string> = {
  date: () =>
    new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  client_nom_complet: (c) => [c.firstName, c.lastName].filter(Boolean).join(" "),
  client_prenom: (c) => c.firstName ?? "",
  client_nom: (c) => c.lastName ?? "",
  client_societe: (c) => c.company ?? "",
  client_email: (c) => c.email ?? "",
  client_telephone: (c) => c.phone ?? "",
  client_pays: (c) => c.country ?? "",
};

function fillStructural(template: string, contact: Record<string, string>): string {
  let result = template;
  for (const [key, fn] of Object.entries(STRUCTURAL_VARS)) {
    const value = fn(contact);
    if (value) result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const { templateContent, contact } = (await req.json()) as {
    templateContent: string;
    contact: Record<string, string>;
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Clé GROQ_API_KEY manquante." }, { status: 500 });
  }

  // Pre-fill known {{variables}} directly
  const partial = fillStructural(templateContent, contact);

  const contactContext = `Nom complet : ${[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
Société : ${contact.company || "—"}
Email : ${contact.email || "—"}
Téléphone : ${contact.phone || "—"}
Pays : ${contact.country || "—"}
Catégorie : ${contact.category || "—"}
Étape pipeline : ${contact.stage || "—"}
Notes : ${contact.notes || "—"}`;

  const systemPrompt = `Tu es un assistant juridique expert en droit des affaires français.
Tu reçois un modèle de contrat (NDA ou MOU) avec des blancs à compléter (_____, ......, [insérer X], [À COMPLÉTER], {{variable}}, cases vides, ou tout autre espace réservé).
Tu reçois aussi les données d'un client.

INSTRUCTIONS :
1. Remplis TOUS les blancs, espaces réservés et variables avec les données du client ou des valeurs appropriées.
2. Pour les informations non fournies (ex: notre société, notre adresse, notre signataire), écris [À COMPLÉTER].
3. Pour la durée si non précisée, propose 12 mois.
4. Pour la juridiction, déduis-la du pays du client si connu, sinon écris "français".
5. Retourne le document COMPLET avec tous les blancs remplis. Ne résume pas, ne modifie pas la structure, conserve le texte existant intact.
6. Ne commente pas, ne fais aucune explication. Retourne uniquement le document rempli.`;

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
          {
            role: "user",
            content: `DONNÉES DU CLIENT :\n${contactContext}\n\n---\n\nMODÈLE DE CONTRAT :\n${partial}`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Groq indisponible : ${err}` }, { status: 502 });
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const document = data.choices[0]?.message?.content?.trim() ?? partial;

    return Response.json({ document });
  } catch {
    // Fallback: return partially filled template
    const fallback = partial.replace(/\{\{(\w+)\}\}/g, "[À COMPLÉTER : $1]");
    return Response.json({ document: fallback });
  }
}
