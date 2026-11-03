import { createHash, createHmac } from "node:crypto";

// Stockage des morceaux de fichiers de la Data Room sur o2switch (script o2switch/fichiers/index.php).
// Actif quand FILES_URL (ex. https://fichiers.netforce-defense.com/) et FILES_SECRET sont définis dans Vercel.
// Chaque demande est signée (HMAC-SHA256) et expire après 5 minutes.

export class RemoteFilesError extends Error {}

export function remoteFilesConfigured(): boolean {
  return !!(process.env.FILES_URL?.trim() && (process.env.FILES_SECRET?.trim().length ?? 0) >= 32);
}

function signedUrl(op: string, id = "", i = 0): string {
  const base = process.env.FILES_URL!.trim();
  const secret = process.env.FILES_SECRET!.trim();
  const exp = Math.floor(Date.now() / 1000) + 300;
  const sig = createHmac("sha256", secret).update(`${op}\n${id}\n${i}\n${exp}`).digest("hex");
  const u = new URL(base);
  u.search = new URLSearchParams({ op, id, i: String(i), exp: String(exp), sig }).toString();
  return u.toString();
}

/** o2switch demande de ralentir (503 / 429) : on fait une pause au lieu d'insister. */
export class RemoteBusyError extends RemoteFilesError {}

const BUSY = new Set([429, 503]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(op: string, id: string, i: number, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;
  let lastStatus = 0;
  // Nouvelles tentatives espacées en cas de coupure réseau, de surcharge ou d'erreur passagère.
  const waits = [1000, 2500, 5000];
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      const res = await fetch(signedUrl(op, id, i), { ...init, signal: AbortSignal.timeout(30_000), cache: "no-store" });
      if (res.status < 500 && !BUSY.has(res.status)) return res;
      // Erreur du script (ex. disque plein) : on garde sa réponse pour afficher son message.
      if (!BUSY.has(res.status) && attempt === waits.length) return res;
      lastStatus = res.status;
      lastError = new RemoteFilesError(`o2switch a répondu ${res.status}`);
      if (attempt === waits.length) break;
      const retryAfter = Number(res.headers.get("retry-after"));
      await res.body?.cancel();
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : waits[attempt]);
      continue;
    } catch (e) {
      lastError = e;
      lastStatus = 0;
    }
    if (attempt < waits.length) await sleep(waits[attempt]);
  }
  if (BUSY.has(lastStatus)) {
    throw new RemoteBusyError(`o2switch est surchargé ou bloque temporairement le CRM (erreur ${lastStatus}). Réessaie dans quelques minutes.`);
  }
  throw new RemoteFilesError(`Stockage o2switch injoignable : ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `erreur ${res.status}`;
  } catch {
    return `erreur ${res.status}`;
  }
}

/** Enregistre un morceau et vérifie qu'o2switch a reçu exactement les mêmes octets. */
export async function remotePut(id: string, i: number, bytes: Uint8Array): Promise<void> {
  const res = await call("put", id, i, { method: "POST", body: Buffer.from(bytes), headers: { "Content-Type": "application/octet-stream" } });
  if (!res.ok) throw new RemoteFilesError(`o2switch refuse l'enregistrement : ${await errorOf(res)}`);
  const j = (await res.json()) as { sha256?: string; size?: number };
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (j.sha256 !== sha || j.size !== bytes.length) throw new RemoteFilesError("Le morceau reçu par o2switch ne correspond pas à l'original.");
}

export async function remoteGet(id: string, i: number): Promise<Uint8Array | null> {
  const res = await call("get", id, i);
  if (res.status === 404) return null;
  if (!res.ok) throw new RemoteFilesError(`Lecture impossible sur o2switch : ${await errorOf(res)}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function remoteHas(id: string, i: number): Promise<boolean> {
  const res = await call("has", id, i);
  if (!res.ok) throw new RemoteFilesError(`o2switch : ${await errorOf(res)}`);
  return ((await res.json()) as { exists?: boolean }).exists === true;
}

export async function remoteDelete(id: string): Promise<void> {
  const res = await call("del", id, 0, { method: "POST" });
  if (!res.ok) throw new RemoteFilesError(`Suppression impossible sur o2switch : ${await errorOf(res)}`);
}

/** Vérifie la connexion (secret, dossier de stockage) et renvoie l'espace libre. */
export async function remotePing(): Promise<{ ok: true; free: number | null } | { ok: false; error: string }> {
  try {
    const res = await call("ping", "", 0);
    if (!res.ok) return { ok: false, error: await errorOf(res) };
    const j = (await res.json()) as { free?: number | null };
    return { ok: true, free: j.free ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
