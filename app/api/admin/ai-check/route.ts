import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { testProviders } from "@/lib/server/llm";

// Paramètres → « Tester les IA » (admins) : quels fournisseurs répondent, avec quel modèle, en combien de temps.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Réservé aux admins." }, { status: 403 });
  const results = await testProviders();
  return Response.json({ results, claudeKey: !!process.env.ANTHROPIC_API_KEY });
}
