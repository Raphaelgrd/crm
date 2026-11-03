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

async function call(op: string, id: string, i: number, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;
  // Deux nouvelles tentatives en cas de coupure réseau ou d'erreur passagère du serveur.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(signedUrl(op, id, i), { ...init, signal: AbortSignal.timeout(30_000), cache: "no-store" });
      if (res.status < 500 || attempt === 2) return res;
      lastError = new RemoteFilesError(`o2switch a répondu ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
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
