// Client minimal de l'API Yousign v3 : envoi des contrats remplis par le CRM pour signature, et suivi.
// Variables Vercel : YOUSIGN_API_KEY, YOUSIGN_ENV ("sandbox" pour les clés de test), YOUSIGN_WEBHOOK_SECRET.

export class YousignError extends Error {}

export const yousignConfigured = () => !!process.env.YOUSIGN_API_KEY?.trim();
export const yousignEnv = () => (process.env.YOUSIGN_ENV?.trim() === "sandbox" ? "sandbox" : "production");

const base = () => (yousignEnv() === "sandbox" ? "https://api-sandbox.yousign.app/v3" : "https://api.yousign.app/v3");

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.YOUSIGN_API_KEY?.trim();
  if (!key) throw new YousignError("Yousign n'est pas connecté : ajoute YOUSIGN_API_KEY dans Vercel.");
  const res = await fetch(base() + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[yousign] ${init.method ?? "GET"} ${path} → ${res.status}`, body.slice(0, 500));
    if (res.status === 401 || res.status === 403) throw new YousignError("Clé Yousign refusée : vérifie YOUSIGN_API_KEY (et YOUSIGN_ENV=sandbox pour une clé de test).");
    let detail = "";
    try {
      const j = JSON.parse(body) as { detail?: string; title?: string; invalid_params?: { name?: string; reason?: string }[] };
      detail = j.detail || j.title || "";
      // Yousign précise les champs refusés : on les affiche pour pouvoir corriger.
      const bad = (j.invalid_params ?? []).map((p) => [p.name, p.reason].filter(Boolean).join(" : ")).filter(Boolean);
      if (bad.length) detail = `${detail.replace(/\.+$/, "")} (${bad.join(" ; ")})`;
    } catch {}
    throw new YousignError(`Yousign a refusé la demande (${res.status})${detail ? ` : ${detail}` : ""}.`);
  }
  return res;
}

const json = async <T>(path: string, method: string, body?: unknown): Promise<T> =>
  (await call(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => r.json())) as T;

export interface YsSigner {
  firstName: string;
  lastName: string;
  email: string;
  /** Emplacement de la signature, en points depuis le coin haut-gauche de la page (pages à partir de 1). */
  field: { page: number; x: number; y: number; width: number; height: number };
}

/** Crée la demande, ajoute le PDF et les signataires, puis l'active : Yousign envoie les emails. */
export async function sendForSignature(opts: {
  name: string;
  externalId: string;
  pdf: Uint8Array;
  filename: string;
  signers: YsSigner[];
}): Promise<{ id: string }> {
  const sr = await json<{ id: string }>("/signature_requests", "POST", {
    name: opts.name.slice(0, 128),
    delivery_mode: "email",
    timezone: "Europe/Paris",
    external_id: opts.externalId,
  });
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(opts.pdf)], { type: "application/pdf" }), opts.filename);
    form.append("nature", "signable_document");
    const document = (await call(`/signature_requests/${sr.id}/documents`, { method: "POST", body: form }).then((r) =>
      r.json(),
    )) as { id: string };
    for (const s of opts.signers) {
      await json(`/signature_requests/${sr.id}/signers`, "POST", {
        info: { first_name: s.firstName, last_name: s.lastName, email: s.email, locale: "fr" },
        signature_level: "electronic_signature",
        signature_authentication_mode: "otp_email",
        fields: [{ document_id: document.id, type: "signature", ...s.field }],
      });
    }
    await json(`/signature_requests/${sr.id}/activate`, "POST");
  } catch (e) {
    // Pas de brouillon orphelin chez Yousign si une étape échoue.
    await call(`/signature_requests/${sr.id}`, { method: "DELETE" }).catch(() => {});
    throw e;
  }
  return { id: sr.id };
}

export interface YsStatus {
  status: string;
  signers: { name: string; email: string; status: string }[];
}

export async function getSignatureStatus(id: string): Promise<YsStatus> {
  const sr = await json<{ status: string }>(`/signature_requests/${id}`, "GET");
  type RawSigner = { status: string; info?: { first_name?: string; last_name?: string; email?: string } };
  const res = await json<RawSigner[] | { data?: RawSigner[] }>(`/signature_requests/${id}/signers`, "GET").catch(() => []);
  const signers = Array.isArray(res) ? res : (res.data ?? []);
  return {
    status: sr.status,
    signers: signers.map((s) => ({
      name: [s.info?.first_name, s.info?.last_name].filter(Boolean).join(" "),
      email: (s.info?.email ?? "").toLowerCase(),
      status: s.status,
    })),
  };
}

export async function cancelSignature(id: string): Promise<void> {
  await json(`/signature_requests/${id}/cancel`, "POST", { reason: "contractualization_aborted" });
}

/** PDF signé (ou en cours) tel que Yousign le conserve. */
export async function downloadSigned(id: string): Promise<Response> {
  return call(`/signature_requests/${id}/documents/download`);
}
