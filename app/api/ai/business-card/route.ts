import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { LlmError, chatCompletion } from "@/lib/server/llm";

export const runtime = "nodejs";
export const maxDuration = 90;

const CATEGORIES = ["Prospect", "Client", "Partenaire", "Fournisseur", "Investisseur", "Distributeur", "Ambassadeur", "Institutionnel", "Banque"];

const SYSTEM = `Tu lis des cartes de visite (photos ou scans, recto et éventuellement verso) pour Netforce, start-up française de gants tactiques pour forces de l'ordre et défense.
Réponds UNIQUEMENT avec un objet JSON :
{"firstName":"","lastName":"","jobTitle":"","company":"","email":"","phone":"","mobile":"","website":"","address":"","city":"","country":"","linkedin":"","otherInfo":"","suggestedCategory":"","uncertain":[]}
Règles :
- Recopie exactement ce qui est écrit ; laisse "" si une information est absente. N'invente rien.
- Téléphones au format international (+33 6 12 34 56 78) quand le pays est identifiable, sinon tels qu'écrits. "phone" = fixe ou standard, "mobile" = portable.
- "country" : nom du pays en français, déduit de l'adresse, de l'indicatif ou du domaine si nécessaire.
- Nom et prénom : sépare-les correctement, avec une majuscule initiale (le nom de famille peut être en majuscules sur la carte).
- "otherInfo" : autres éléments utiles (grade, unité, deuxième email, fax…).
- "suggestedCategory" parmi : ${CATEGORIES.join(", ")}. Ministère, police, gendarmerie, armée, administration → Institutionnel ; revendeur, importateur → Distributeur ; fonds, business angel → Investisseur ; banque → Banque. Sinon Prospect.
- "uncertain" : liste des champs que tu n'as pas pu lire avec certitude (flou, reflet, écriture stylisée).
- Si l'image n'est pas une carte de visite, renvoie {"error":"Ce n'est pas une carte de visite."}.`;

export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const { images } = (await req.json()) as { images?: string[] };
  const valid = (images ?? []).filter((u) => /^data:image\/(jpeg|png|webp);base64,/.test(u)).slice(0, 2);
  if (!valid.length) return Response.json({ error: "Image manquante." }, { status: 400 });
  if (valid.reduce((s, u) => s + u.length, 0) > 6_000_000) return Response.json({ error: "Image trop lourde." }, { status: 413 });

  try {
    const { content } = await chatCompletion({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: valid.length > 1 ? "Voici le recto puis le verso de la carte." : "Voici la carte de visite." },
      ],
      images: valid,
      maxTokens: 1200,
      temperature: 0,
    });
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) throw new LlmError("Lecture illisible, réessaie avec une photo plus nette.");
    const card = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof card.error === "string") return Response.json({ error: card.error }, { status: 422 });
    const s = (k: string) => (typeof card[k] === "string" ? (card[k] as string).trim() : "");
    return Response.json({
      card: {
        firstName: s("firstName"),
        lastName: s("lastName"),
        jobTitle: s("jobTitle"),
        company: s("company"),
        email: s("email").toLowerCase(),
        phone: s("phone"),
        mobile: s("mobile"),
        website: s("website"),
        address: [s("address"), s("city")].filter(Boolean).join(", "),
        country: s("country"),
        linkedin: s("linkedin"),
        otherInfo: s("otherInfo"),
        suggestedCategory: CATEGORIES.includes(s("suggestedCategory")) ? s("suggestedCategory") : "Prospect",
        uncertain: Array.isArray(card.uncertain) ? card.uncertain.map(String) : [],
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof LlmError ? e.message : "Lecture impossible, réessaie." }, { status: 502 });
  }
}
