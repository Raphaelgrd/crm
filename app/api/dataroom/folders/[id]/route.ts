import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { trashDataroomFolder } from "@/lib/server/trash";
import {
  listFiles,
  listFolders,
  storageError,
  updateFolder,
  updateMeta,
  type FolderRecord,
} from "@/lib/server/dataroom";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const under = (folder: string, name: string) => folder === name || folder.startsWith(name + "/");

async function adminFolder(req: NextRequest, ctx: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return { res: unauthorized() };
  if (!user.isAdmin) return { res: Response.json({ error: "Réservé aux admins." }, { status: 403 }) };
  const id = (await ctx.params).id;
  const folders = await listFolders();
  const folder = folders.find((f) => f.id === id);
  if (!folder) return { res: Response.json({ error: "Data Room introuvable." }, { status: 404 }) };
  return { folder, folders, user };
}

/** Renomme (avec ses fichiers), change la visibilité ou la liste de partage. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const r = await adminFolder(req, ctx);
    if ("res" in r) return r.res;
    const { folder, folders } = r;
    const b = (await req.json()) as { name?: unknown; visibility?: unknown; sharedWith?: unknown };
    const patch: Partial<FolderRecord> = {};
    if (b.visibility === "public" || b.visibility === "private") patch.visibility = b.visibility;
    if (Array.isArray(b.sharedWith)) {
      patch.sharedWith = [...new Set(b.sharedWith.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL.test(e)))].slice(0, 100);
    }
    if (typeof b.name === "string") {
      const clean = b.name.trim().replace(/\//g, "-").slice(0, 120);
      if (clean && clean !== folder.name) {
        if (folders.some((f) => f.name === clean)) return Response.json({ error: "Ce nom est déjà pris." }, { status: 409 });
        patch.name = clean;
        // Les fichiers du dossier et de ses sous-dossiers suivent.
        for (const f of await listFiles()) {
          if (under(f.folder, folder.name)) await updateMeta(f.id, { folder: clean + f.folder.slice(folder.name.length) });
        }
      }
    }
    if (Object.keys(patch).length) await updateFolder(folder.id, patch);
    return Response.json({ folder: { ...folder, ...patch } });
  } catch (e) {
    return storageError(e);
  }
}

/** Supprime la Data Room et tous ses fichiers. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const r = await adminFolder(req, ctx);
    if ("res" in r) return r.res;
    // Corbeille : la Data Room et ses fichiers restent restaurables 30 jours (contenu conservé jusque-là).
    const files = (await listFiles()).filter((f) => under(f.folder, r.folder.name));
    await trashDataroomFolder({ ...r.folder }, files, r.user.email);
    return Response.json({ ok: true });
  } catch (e) {
    return storageError(e);
  }
}
