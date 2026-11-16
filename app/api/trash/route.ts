import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { TRASH_DAYS, TrashError, listTrash, purgeExpired, purgeTrash, restoreTrash } from "@/lib/server/trash";
import { storageError } from "@/lib/server/dataroom";

// Corbeille : GET liste (et purge ce qui a plus de 30 jours), POST { action: "restore" | "purge" | "empty", ids }.
// Restaurer : tout membre. Supprimer définitivement / vider : admins.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  try {
    let entries = await listTrash();
    if (await purgeExpired(entries)) entries = await listTrash();
    return Response.json({ days: TRASH_DAYS, entries });
  } catch (e) {
    return storageError(e);
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown };
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : [];
  try {
    if (b.action === "restore") {
      const restored: string[] = [];
      const errors: string[] = [];
      for (const id of ids) {
        try {
          restored.push((await restoreTrash(id)).label);
        } catch (e) {
          errors.push(e instanceof TrashError ? e.message : `Restauration impossible : ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return Response.json({ restored, errors });
    }
    if (b.action === "purge" || b.action === "empty") {
      if (!user.isAdmin) return Response.json({ error: "Suppression définitive réservée aux admins." }, { status: 403 });
      const targets = b.action === "empty" ? (await listTrash()).map((e) => e.id) : ids;
      for (const id of targets) await purgeTrash(id);
      return Response.json({ purged: targets.length });
    }
    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (e) {
    return storageError(e);
  }
}
