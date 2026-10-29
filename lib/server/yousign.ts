// Client minimal de l'API Yousign v3 : envoi des modèles (NDA, MOU…) pour signature et suivi.
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
      const j = JSON.parse(body) as { detail?: string; title?: string };
      detail = j.detail || j.title || "";
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

export interface YsTemplate {
  id: string;
  name: string;
  /** Libellés des signataires à renseigner à chaque envoi (ex. « Partenaire »). */
  labels: string[];
}

type RawTemplate = { id: string; name?: string; signers?: { label?: string | null; type?: string }[]; placeholder_signers?: { label?: string }[] };

const labelsOf = (t: RawTemplate) =>
  [...(t.placeholder_signers ?? []), ...(t.signers ?? [])]
    .map((s) => s.label?.trim() ?? "")
    .filter((l, i, a) => l && a.indexOf(l) === i);

/** Modèles Yousign du compte, avec leurs signataires à compléter. */
export async function listTemplates(): Promise<YsTemplate[]> {
  const res = await json<{ data?: RawTemplate[] } | RawTemplate[]>("/templates?limit=100", "GET");
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return Promise.all(
    list.slice(0, 50).map(async (t) => {
      let labels = labelsOf(t);
      if (!labels.length) labels = labelsOf(await json<RawTemplate>(`/templates/${t.id}`, "GET").catch(() => t));
      return { id: t.id, name: t.name?.trim() || "Modèle sans nom", labels };
    }),
  );
}

export interface YsPlaceholder {
  label: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** Crée la demande depuis un modèle, renseigne les signataires puis l'active : Yousign envoie les emails. */
export async function sendFromTemplate(opts: {
  templateId: string;
  name: string;
  externalId: string;
  signers: YsPlaceholder[];
}): Promise<{ id: string }> {
  const sr = await json<{ id: string }>("/signature_requests", "POST", {
    name: opts.name.slice(0, 128),
    delivery_mode: "email",
    timezone: "Europe/Paris",
    external_id: opts.externalId,
    template_id: opts.templateId,
    template_placeholders: {
      signers: opts.signers.map((s) => ({
        label: s.label,
        info: { first_name: s.firstName, last_name: s.lastName, email: s.email, locale: "fr" },
      })),
    },
  });
  try {
    await json(`/signature_requests/${sr.id}/activate`, "POST");
  } catch (e) {
    // Pas de brouillon orphelin chez Yousign si l'activation échoue.
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
