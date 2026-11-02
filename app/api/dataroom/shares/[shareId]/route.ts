import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { getShare, storageError, updateShare } from "@/lib/server/dataroom";

export const runtime = "nodejs";

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
