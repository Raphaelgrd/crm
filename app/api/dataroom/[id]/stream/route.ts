import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { folderAccess, getMeta, storageError } from "@/lib/server/dataroom";
import { checkStreamToken, rangeResponse, streamToken } from "@/lib/server/fileStream";

// Lecture en continu d'un fichier de la Data Room (vidéos) par un membre de l'équipe.
// POST (session du CRM, droits vérifiés) → lien signé valable 1 h ; GET ?t=… → plages d'octets demandées par le lecteur.

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  try {
    const meta = await getMeta((await ctx.params).id);
    if (!meta || !(await folderAccess(user))(meta.folder)) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
    return Response.json({ url: `/api/dataroom/${meta.id}/stream?t=${streamToken(meta.id)}` });
  } catch (e) {
    return storageError(e);
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const id = (await ctx.params).id;
  if (!checkStreamToken(id, req.nextUrl.searchParams.get("t"))) return Response.json({ error: "Lien de lecture expiré : rouvre l'aperçu." }, { status: 403 });
  try {
    const meta = await getMeta(id);
    if (!meta) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
    return await rangeResponse(req, meta);
  } catch (e) {
    return storageError(e);
  }
}
