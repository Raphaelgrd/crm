import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import {
  deleteChunks,
  deleteMeta,
  duplicateCandidates,
  fileDigest,
  getMeta,
  listFiles,
  storageError,
  type FileMeta,
} from "@/lib/server/dataroom";
import { RemoteBusyError } from "@/lib/server/remoteFiles";

// Doublons de la Data Room (admins).
// GET : groupes candidats (même dossier, nom et taille). POST { action: "verify", ids } : compare le contenu d'un groupe.
// POST { action: "delete", keep, remove } : supprime des copies (mêmes dossier, nom et taille que l'exemplaire gardé).

export const runtime = "nodejs";
export const maxDuration = 60;

const PAUSE_MS = 200;

async function admin(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return { res: unauthorized() };
  if (!user.isAdmin) return { res: Response.json({ error: "Réservé aux admins." }, { status: 403 }) };
  return { user };
}

const brief = (f: FileMeta) => ({ id: f.id, name: f.name, folder: f.folder, size: f.size, createdAt: f.createdAt });
const sameFile = (a: FileMeta, b: FileMeta) => a.folder === b.folder && a.name === b.name && a.size === b.size && a.id !== b.id;

export async function GET(req: NextRequest) {
  const a = await admin(req);
  if ("res" in a) return a.res;
  try {
    return Response.json({ groups: duplicateCandidates(await listFiles()).map((g) => g.map(brief)) });
  } catch (e) {
    return storageError(e);
  }
}

export async function POST(req: NextRequest) {
  const a = await admin(req);
  if ("res" in a) return a.res;
  const b = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown; keep?: unknown; remove?: unknown };
  try {
    if (b.action === "verify") {
      const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 20) : [];
      const metas = (await Promise.all(ids.map((id) => getMeta(id)))).filter((m): m is FileMeta => !!m);
      if (metas.length < 2 || metas.some((m) => !sameFile(metas[0], m) && m.id !== metas[0].id)) {
        return Response.json({ error: "Groupe invalide." }, { status: 400 });
      }
      metas.sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)) || x.id.localeCompare(y.id));
      // Pour chaque contenu différent, on garde le plus ancien exemplaire ; les autres copies identiques sont à supprimer.
      const byDigest = new Map<string, FileMeta[]>();
      for (const m of metas) {
        const d = await fileDigest(m, PAUSE_MS);
        byDigest.set(d, [...(byDigest.get(d) ?? []), m]);
      }
      const sets = [...byDigest.values()].map((l) => ({ keep: brief(l[0]), remove: l.slice(1).map(brief) }));
      return Response.json({ sets, differentContents: sets.length > 1 });
    }

    if (b.action === "delete") {
      const keep = await getMeta(String(b.keep ?? ""));
      const ids = Array.isArray(b.remove) ? b.remove.map(String).slice(0, 20) : [];
      if (!keep || !ids.length) return Response.json({ error: "Rien à supprimer." }, { status: 400 });
      const removed: string[] = [];
      for (const id of ids) {
        const m = await getMeta(id);
        // Garde-fou : on ne supprime qu'une copie du fichier conservé, jamais le fichier conservé lui-même.
        if (!m || !sameFile(keep, m)) continue;
        await deleteMeta(m.id);
        await deleteChunks(m);
        removed.push(m.id);
      }
      return Response.json({ removed });
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (e) {
    if (e instanceof RemoteBusyError) return Response.json({ error: e.message, busy: true }, { status: 503 });
    return storageError(e);
  }
}
