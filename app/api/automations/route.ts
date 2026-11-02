import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { AutomationError, createAutomation, validateAutomation } from "@/lib/server/automations";

export const runtime = "nodejs";

/** Crée une automatisation (écran Automatisations). */
export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  try {
    const input = await validateAutomation((await req.json()) as Record<string, unknown>);
    return Response.json({ automation: await createAutomation(input) });
  } catch (e) {
    if (e instanceof AutomationError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[automations]", e);
    return Response.json({ error: "Enregistrement impossible, réessaie." }, { status: 500 });
  }
}
