import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { getShare, storageError, updateShare } from "@/lib/server/dataroom";
import { SHARE_DURATIONS } from "@/lib/server/shares";

export const runtime = "nodejs";

/** Modifie la durée d'un accès invité (à partir d'aujourd'hui) ; rétablit aussi un accès expiré ou retiré. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Seul un admin peut modifier un accès." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { days?: unknown };
  const days = Number(b.days);
  if (!SHARE_DURATIONS.includes(days)) return Response.json({ error: "Durée invalide." }, { status: 400 });
  try {
    const share = await getShare((await params).shareId);
    if (!share) return Response.json({ error: "Partage introuvable." }, { status: 404 });
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    await updateShare(share.id, { expiresAt, revoked: false });
    return Response.json({ ok: true, expiresAt });
  } catch (e) {
    return storageError(e);
  }
}

/** Retire l'accès d'un invité immédiatement. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Seul un admin peut retirer un accès." }, { status: 403 });
  try {
    const share = await getShare((await params).shareId);
    if (!share) return Response.json({ error: "Partage introuvable." }, { status: 404 });
    await updateShare(share.id, { revoked: true });
    return Response.json({ ok: true });
  } catch (e) {
    return storageError(e);
  }
}
