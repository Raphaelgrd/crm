import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

// Comptes de service (JSON brut ou encodé en base64) dans les variables Vercel.
function load(envName: string, appName: string): App | null {
  const raw = process.env[envName]?.trim();
  if (!raw) return null;
  const existing = getApps().find((a) => a.name === appName);
  if (existing) return existing;
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    return initializeApp({ credential: cert(json) }, appName);
  } catch (e) {
    // Une clé mal collée dans Vercel ne doit pas bloquer tout le CRM : on retombe sur le mode sans compte de service.
    console.error(`[admin] ${envName} invalide :`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Projet du CRM (crm-netforce) : données du CRM. */
export const crmAdminApp = () => load("FIREBASE_SERVICE_ACCOUNT_CRM", "admin-crm");

/** Projet des comptes et du rapport d'activité (netforce-38edf). */
export const rapportAdminApp = () => load("FIREBASE_SERVICE_ACCOUNT_RAPPORT", "admin-rapport");

export type AccountCheck = "ok" | "absente" | "illisible" | "mauvais projet" | "refusée par Google";

/** État d'un compte de service (sans jamais renvoyer son contenu) : présent, lisible, bon projet, accepté par Google. */
export async function checkServiceAccount(
  envName: "FIREBASE_SERVICE_ACCOUNT_CRM" | "FIREBASE_SERVICE_ACCOUNT_RAPPORT",
  expectedProject: string,
): Promise<{ status: AccountCheck; project?: string }> {
  const raw = process.env[envName]?.trim();
  if (!raw) return { status: "absente" };
  let json: { project_id?: string; private_key?: string; client_email?: string };
  try {
    json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return { status: "illisible" };
  }
  if (!json.private_key || !json.client_email) return { status: "illisible" };
  if (expectedProject && json.project_id !== expectedProject) return { status: "mauvais projet", project: json.project_id };
  const app = envName === "FIREBASE_SERVICE_ACCOUNT_CRM" ? crmAdminApp() : rapportAdminApp();
  if (!app) return { status: "illisible" };
  try {
    // Lecture minimale pour vérifier que Google accepte la clé (clé révoquée, droits insuffisants…).
    const { getFirestore } = await import("firebase-admin/firestore");
    await getFirestore(app).collection(envName === "FIREBASE_SERVICE_ACCOUNT_CRM" ? "contacts" : "users").limit(1).get();
    return { status: "ok", project: json.project_id };
  } catch {
    return { status: "refusée par Google", project: json.project_id };
  }
}
