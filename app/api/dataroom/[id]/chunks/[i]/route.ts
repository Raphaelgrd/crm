import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { CHUNK_SIZE, MAX_FILE_SIZE, folderAccess, getMeta, readChunk, saveChunk, storageError, validFileId } from "@/lib/server/dataroom";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; i: string }> };

async function parse(ctx: Ctx) {
  const { id, i } = await ctx.params;
  const n = Number(i);
  const ok = validFileId(id) && Number.isInteger(n) && n >= 0 && n < Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE);
  return ok ? { id, n } : null;
}

/** Envoie un morceau (corps brut, 900 Ko max). Le fichier n'apparaît qu'une fois enregistré via POST /api/dataroom. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const p = await parse(ctx);
  if (!p) return Response.json({ error: "Morceau invalide." }, { status: 400 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > CHUNK_SIZE) return Response.json({ error: "Morceau vide ou trop gros." }, { status: 413 });
  try {
    // Un fichier déjà enregistré ne se réécrit pas morceau par morceau.
    if (await getMeta(p.id)) return Response.json({ error: "Fichier déjà enregistré." }, { status: 409 });
    await saveChunk(p.id, p.n, bytes, user.email);
    return Response.json({ ok: true });
  } catch (e) {
    return storageError(e);
  }
}

/** Lit un morceau d'un fichier accessible au membre. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const p = await parse(ctx);
  if (!p) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
  try {
    const meta = await getMeta(p.id);
    if (!meta || p.n >= meta.chunks || !(await folderAccess(user))(meta.folder)) {
      return Response.json({ error: "Fichier introuvable." }, { status: 404 });
    }
    const bytes = await readChunk(p.id, p.n);
    if (!bytes) return Response.json({ error: "Contenu manquant." }, { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return storageError(e);
  }
}
