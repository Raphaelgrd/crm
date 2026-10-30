import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import {
  CHUNK_SIZE,
  MAX_FILE_SIZE,
  folderAccess,
  hasChunk,
  listFiles,
  saveMeta,
  storageError,
  validFileId,
  type FileMeta,
} from "@/lib/server/dataroom";

export const runtime = "nodejs";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Fichiers de la Data Room visibles par le membre. */
export async function GET(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  try {
    const [files, canSee] = await Promise.all([listFiles(), folderAccess(user)]);
    return Response.json({ files: files.filter((f) => canSee(f.folder)) });
  } catch (e) {
    return storageError(e);
  }
}

/** Enregistre un fichier dont tous les morceaux ont été envoyés. */
export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const b = (await req.json()) as Record<string, unknown>;
  const id = str(b.id, 80);
  const size = Number(b.size);
  const folder = str(b.folder, 500);
  if (!validFileId(id)) return Response.json({ error: "Identifiant de fichier invalide." }, { status: 400 });
  if (!str(b.name, 255)) return Response.json({ error: "Nom de fichier manquant." }, { status: 400 });
  if (!Number.isInteger(size) || size < 0 || size > MAX_FILE_SIZE) return Response.json({ error: "Fichier trop lourd (50 Mo max)." }, { status: 413 });
  try {
    if (!(await folderAccess(user))(folder)) return Response.json({ error: "Dossier non autorisé." }, { status: 403 });
    const chunks = Math.max(1, Math.ceil(size / CHUNK_SIZE));
    // On vérifie que le contenu est bien arrivé avant de faire apparaître le fichier.
    for (let i = 0; i < chunks; i++) {
      if (!(await hasChunk(id, i))) return Response.json({ error: "Envoi incomplet, réessaie." }, { status: 409 });
    }
    const meta: FileMeta = {
      id,
      name: str(b.name, 255),
      mime: str(b.mime, 120) || "application/octet-stream",
      size,
      folder,
      createdAt: str(b.createdAt, 40) || new Date().toISOString(),
      chunks,
      uploadedBy: user.email,
    };
    await saveMeta(meta);
    return Response.json({ file: meta });
  } catch (e) {
    return storageError(e);
  }
}
