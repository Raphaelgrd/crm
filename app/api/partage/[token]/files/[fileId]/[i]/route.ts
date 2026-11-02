import { NextRequest } from "next/server";
import { getMeta, readChunk, storageError } from "@/lib/server/dataroom";
import { checkShareToken } from "@/lib/server/shares";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string; fileId: string; i: string }> };

/** Morceau d'un fichier de la Data Room partagée (refusé pour tout fichier hors de cette Data Room). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { token, fileId, i } = await params;
    const access = await checkShareToken(token);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const meta = await getMeta(fileId);
    const n = Number(i);
    const name = access.folder.name;
    const inside = !!meta && (meta.folder === name || meta.folder.startsWith(name + "/"));
    if (!meta || !inside || !Number.isInteger(n) || n < 0 || n >= meta.chunks) {
      return Response.json({ error: "Fichier introuvable." }, { status: 404 });
    }
    const bytes = await readChunk(fileId, n);
    if (!bytes) return Response.json({ error: "Contenu manquant." }, { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (e) {
    return storageError(e);
  }
}
