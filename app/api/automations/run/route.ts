import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { runAutomationsSafely, type AutomationEvent } from "@/lib/server/automations";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Événement venu de l'écran (contact créé, changement d'étape) : le serveur exécute les automatisations. */
export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const b = (await req.json()) as { type?: string; contactId?: string; from?: string; to?: string };
  const contactId = typeof b.contactId === "string" ? b.contactId.trim() : "";
  if (!/^[\w-]{3,80}$/.test(contactId)) return Response.json({ error: "Contact invalide." }, { status: 400 });
  let event: AutomationEvent;
  if (b.type === "contact_created") event = { type: "contact_created", contactId };
  else if (b.type === "stage_changed") event = { type: "stage_changed", contactId, from: String(b.from ?? ""), to: String(b.to ?? "") };
  else return Response.json({ error: "Événement inconnu." }, { status: 400 });
  return Response.json({ ran: await runAutomationsSafely(event) });
}
