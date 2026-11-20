import { NextRequest } from "next/server";
import { getMeta, storageError } from "@/lib/server/dataroom";
import { rangeResponse } from "@/lib/server/fileStream";
import { checkShareToken, inShareScope } from "@/lib/server/shares";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string; fileId: string }> };

/** Lecture en continu (vidéos) d'un fichier partagé avec un invité : uniquement ce qui fait partie du partage. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token, fileId } = await params;
    const access = await checkShareToken(token);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const meta = await getMeta(fileId);
    if (!meta || !inShareScope(access.share, access.folder, meta)) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
    const res = await rangeResponse(req, meta);
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  } catch (e) {
    return storageError(e);
  }
}
