import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { AutomationError, deleteAutomation, getAutomation, patchAutomation, validateAutomation } from "@/lib/server/automations";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Modifie une automatisation : activation seule, ou contenu complet (revalidé). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  try {
    const current = await getAutomation((await params).id);
    if (!current) return Response.json({ error: "Automatisation introuvable." }, { status: 404 });
    const b = (await req.json()) as Record<string, unknown>;
    const onlyToggle = Object.keys(b).every((k) => k === "active");
    const patch = onlyToggle ? { active: b.active === true } : await validateAutomation({ ...current, ...b });
    await patchAutomation(current.id, patch);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof AutomationError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[automations]", e);
    return Response.json({ error: "Enregistrement impossible, réessaie." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  try {
    const current = await getAutomation((await params).id);
    if (!current) return Response.json({ error: "Automatisation introuvable." }, { status: 404 });
    await deleteAutomation(current.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[automations]", e);
    return Response.json({ error: "Suppression impossible, réessaie." }, { status: 500 });
  }
}
