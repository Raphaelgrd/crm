import { createHmac } from "node:crypto";
import { safeEqual } from "./apiKey";
import { CHUNK_SIZE, readChunk, type FileMeta } from "./dataroom";

// Lecture en continu (vidéos) : le lecteur du navigateur demande des plages d'octets (en-tête Range) ;
// on ne lit que les morceaux de 900 Ko concernés, au lieu de télécharger tout le fichier avant de le lire.

const MAX_PART = 2 * CHUNK_SIZE; // au plus 1,8 Mo par réponse (limite de réponse Vercel : 4,5 Mo)

const MIME: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" };
export const mediaType = (meta: Pick<FileMeta, "name" | "mime">) =>
  meta.mime && meta.mime !== "application/octet-stream" ? meta.mime : MIME[(meta.name.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";

/** Réponse 206 (ou 200 pour un fichier vide) pour la plage demandée par le lecteur. */
export async function rangeResponse(req: Request, meta: FileMeta): Promise<Response> {
  const type = mediaType(meta);
  const base = { "Accept-Ranges": "bytes", "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };
  const total = meta.size;
  if (!total) return new Response(new Uint8Array(0), { status: 200, headers: { ...base, "Content-Length": "0" } });
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get("range") ?? "bytes=0-").trim());
  let start: number;
  let end: number;
  if (!m || (m[1] === "" && m[2] === "")) {
    start = 0;
    end = total - 1;
  } else if (m[1] === "") {
    // « bytes=-N » : les N derniers octets.
    start = Math.max(0, total - Number(m[2]));
    end = total - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  }
  if (start >= total || end < start) {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
  }
  end = Math.min(end, start + MAX_PART - 1);
  const first = Math.floor(start / CHUNK_SIZE);
  const last = Math.floor(end / CHUNK_SIZE);
  const parts: Uint8Array[] = [];
  for (let i = first; i <= last; i++) {
    const bytes = await readChunk(meta, i);
    if (!bytes) return Response.json({ error: "Contenu manquant." }, { status: 404 });
    parts.push(bytes);
  }
  const joined = Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  const offset = start - first * CHUNK_SIZE;
  const body = joined.subarray(offset, offset + (end - start + 1));
  return new Response(new Uint8Array(body), {
    status: 206,
    headers: { ...base, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(body.length) },
  });
}

// --- Liens de lecture signés (équipe) : le lecteur vidéo ne peut pas envoyer la session du CRM ---

function secret(): string {
  const s = process.env.STREAM_SECRET || process.env.FILES_SECRET || process.env.CRM_API_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_CRM;
  if (!s) throw new Error("Aucun secret pour signer les liens de lecture.");
  return s;
}
const sign = (fileId: string, exp: number) => createHmac("sha256", secret()).update(`stream\n${fileId}\n${exp}`).digest("hex");

/** Jeton valable 1 heure pour lire ce fichier en continu. */
export function streamToken(fileId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${exp}.${sign(fileId, exp)}`;
}

export function checkStreamToken(fileId: string, token: string | null): boolean {
  const [expStr, sig] = (token ?? "").split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp < Date.now() / 1000 || !sig) return false;
  return safeEqual(sig, sign(fileId, exp));
}
