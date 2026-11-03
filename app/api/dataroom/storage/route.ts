import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { listFiles, moveFileToRemote, storageError } from "@/lib/server/dataroom";
import { RemoteBusyError, remoteFilesConfigured, remotePing } from "@/lib/server/remoteFiles";

// Stockage des fichiers de la Data Room (admins) : état (Firebase / o2switch) et transfert vers o2switch.

export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 35_000;
const PAUSE_MS = 250; // entre deux morceaux
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function admin(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return { res: unauthorized() };
  if (!user.isAdmin) return { res: Response.json({ error: "Réservé aux admins." }, { status: 403 }) };
  return { user };
}

/** Où sont rangés les fichiers, et la connexion à o2switch fonctionne-t-elle ? */
export async function GET(req: NextRequest) {
  const a = await admin(req);
  if ("res" in a) return a.res;
  try {
    const files = await listFiles();
    const onRemote = files.filter((f) => f.storage === "o2switch");
    const onFirebase = files.filter((f) => f.storage !== "o2switch");
    const sum = (l: typeof files) => l.reduce((t, f) => t + (f.size || 0), 0);
    return Response.json({
      configured: remoteFilesConfigured(),
      remote: remoteFilesConfigured() ? await remotePing() : null,
      firebase: { files: onFirebase.length, bytes: sum(onFirebase) },
      o2switch: { files: onRemote.length, bytes: sum(onRemote) },
    });
  } catch (e) {
    return storageError(e);
  }
}

/** Transfère vers o2switch les fichiers encore sur Firebase, par lots (à rappeler jusqu'à remaining = 0). */
export async function POST(req: NextRequest) {
  const a = await admin(req);
  if ("res" in a) return a.res;
  if (!remoteFilesConfigured()) {
    return Response.json({ error: "Le stockage o2switch n'est pas configuré (FILES_URL et FILES_SECRET dans Vercel)." }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { skip?: unknown };
  const skip = new Set(Array.isArray(body.skip) ? body.skip.map(String) : []);
  try {
    const ping = await remotePing();
    if (!ping.ok) {
      const error = "error" in ping ? ping.error : "erreur inconnue";
      // Surcharge passagère : le navigateur fait une pause puis reprend.
      if (/surchargé/.test(error)) return Response.json({ moved: [], failed: [], remaining: -1, paused: true, error });
      return Response.json({ error: `o2switch ne répond pas correctement : ${error}` }, { status: 502 });
    }
    const start = Date.now();
    const todo = (await listFiles()).filter((f) => f.storage !== "o2switch" && !skip.has(f.id));
    const moved: string[] = [];
    const failed: { id: string; name: string; error: string }[] = [];
    let paused = false;
    for (const f of todo) {
      if (Date.now() - start > BUDGET_MS) break;
      try {
        await moveFileToRemote(f, PAUSE_MS);
        moved.push(f.name);
      } catch (e) {
        // o2switch sature : on s'arrête sans compter le fichier en échec (il reste sur Firebase, intact).
        if (e instanceof RemoteBusyError) {
          paused = true;
          break;
        }
        failed.push({ id: f.id, name: f.name, error: e instanceof Error ? e.message : String(e) });
      }
      await sleep(PAUSE_MS);
    }
    const remaining = todo.length - moved.length - failed.length;
    return Response.json({ moved, failed, remaining, paused });
  } catch (e) {
    return storageError(e);
  }
}
