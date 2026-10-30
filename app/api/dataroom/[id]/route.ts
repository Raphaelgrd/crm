import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { deleteChunks, deleteMeta, folderAccess, getMeta, storageError, updateMeta } from "@/lib/server/dataroom";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Renomme ou déplace un fichier. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const b = (await req.json()) as { name?: unknown; folder?: unknown };
  try {
    const meta = await getMeta((await params).id);
    const canSee = await folderAccess(user);
    if (!meta || !canSee(meta.folder)) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
    const patch: { name?: string; folder?: string } = {};
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 255);
    if (typeof b.folder === "string") {
      const folder = b.folder.trim().slice(0, 500);
      if (!canSee(folder)) return Response.json({ error: "Dossier non autorisé." }, { status: 403 });
      patch.folder = folder;
    }
    if (Object.keys(patch).length) await updateMeta(meta.id, patch);
    return Response.json({ file: { ...meta, ...patch } });
  } catch (e) {
    return storageError(e);
  }
}

/** Supprime un fichier et son contenu. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  try {
    const meta = await getMeta((await params).id);
    if (!meta || !(await folderAccess(user))(meta.folder)) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
    await deleteMeta(meta.id);
    await deleteChunks(meta.id, meta.chunks);
    return Response.json({ ok: true });
  } catch (e) {
    return storageError(e);
  }
}
