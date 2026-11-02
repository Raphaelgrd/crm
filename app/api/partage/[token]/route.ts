import { NextRequest } from "next/server";
import { storageError } from "@/lib/server/dataroom";
import { checkShareToken, recordOpen, sharedFiles } from "@/lib/server/shares";

export const runtime = "nodejs";

// Accès invité : aucun compte CRM, le lien signé fait office d'identifiant.
// L'invité ne voit que la Data Room partagée, jusqu'à l'expiration.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const access = await checkShareToken((await params).token);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const { share, folder } = access;
    await recordOpen(share);
    const files = (await sharedFiles(folder)).map((f) => ({
      id: f.id,
      name: f.name,
      mime: f.mime,
      size: f.size,
      chunks: f.chunks,
      // Chemin relatif à la Data Room ("" = racine).
      path: f.folder === folder.name ? "" : f.folder.slice(folder.name.length + 1),
      createdAt: f.createdAt,
    }));
    return Response.json(
      { folder: folder.name, email: share.email, expiresAt: share.expiresAt, files },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
    );
  } catch (e) {
    return storageError(e);
  }
}
