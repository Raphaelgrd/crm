import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

// Comptes de service (JSON brut ou encodé en base64) dans les variables Vercel.
function load(envName: string, appName: string): App | null {
  const raw = process.env[envName]?.trim();
  if (!raw) return null;
  const existing = getApps().find((a) => a.name === appName);
  if (existing) return existing;
  const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  return initializeApp({ credential: cert(json) }, appName);
}

/** Projet du CRM (crm-netforce) : données du CRM. */
export const crmAdminApp = () => load("FIREBASE_SERVICE_ACCOUNT_CRM", "admin-crm");

/** Projet des comptes et du rapport d'activité (netforce-38edf). */
export const rapportAdminApp = () => load("FIREBASE_SERVICE_ACCOUNT_RAPPORT", "admin-rapport");
