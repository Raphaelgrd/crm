import { NextRequest } from "next/server";

const STRUCTURAL_VARS: Record<string, (c: Record<string, string>) => string> = {
  date: () =>
    new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  client_nom_complet: (c) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || "",
  client_prenom: (c) => c.firstName || "",
  client_nom: (c) => c.lastName || "",
  client_societe: (c) => c.company || "",
  client_email: (c) => c.email || "",
  client_telephone: (c) => c.phone || "",
  client_pays: (c) => c.country || "",
};

function fillStructural(template: string, contact: Record<string, string>): string {
  let result = template;
  for (const [key, fn] of Object.entries(STRUCTURAL_VARS)) {
    const value = fn(contact);
    if (value) result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function extractVars(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

export async function POST(req: NextRequest) {
  const { templateContent, contact } = (await req.json()) as {
    templateContent: string;
    contact: Record<string, string>;
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Clé GROQ_API_KEY manquante." }, { status: 500 });
  }

  const partial = fillStructural(templateContent, contact);
  const remaining = extractVars(partial);

  if (remaining.length === 0) {
    return Response.json({ document: partial });
  }

  const contactContext = `Nom complet : ${[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
Société : ${contact.company || "—"}
Email : ${contact.email || "—"}
Téléphone : ${contact.phone || "—"}
Pays : ${contact.country || "—"}
Catégorie : ${contact.category || "—"}
Étape pipeline : ${contact.stage || "—"}
Notes : ${contact.notes || "—"}`;

  const systemPrompt = `Tu es un assistant juridique expert. À partir d'informations sur un client, remplis les variables manquantes d'un document légal.
Réponds UNIQUEMENT avec un objet JSON valide {"variable": "valeur"}.
Si tu ne peux pas déterminer une valeur avec certitude, retourne une chaîne vide "".
Pour "juridiction", utilise le droit du pays du client si connu, sinon "français".
Pour "objet_accord", synthétise l'objet probable de la relation commerciale en une courte phrase.
Pour "duree_mois", propose 12 si non précisé.`;

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
            content: `Informations client :\n${contactContext}\n\nVariables à remplir :\n${remaining.map((v) => `- ${v}`).join("\n")}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    let aiVars: Record<string, string> = {};
    if (res.ok) {
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      try {
        aiVars = JSON.parse(data.choices[0]?.message?.content ?? "{}") as Record<string, string>;
      } catch {
        // ignore parse errors, fall through to [À COMPLÉTER]
      }
    }

    let finalDoc = partial;
    for (const varName of remaining) {
      const value = aiVars[varName];
      finalDoc = finalDoc.replaceAll(
        `{{${varName}}}`,
        value || `[À COMPLÉTER : ${varName}]`,
      );
    }

    return Response.json({ document: finalDoc });
  } catch {
    const fallback = partial.replace(/\{\{(\w+)\}\}/g, "[À COMPLÉTER : $1]");
    return Response.json({ document: fallback });
  }
}
