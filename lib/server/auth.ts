import { NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { MEMBERS_CUTOFF, isOwnerEmail } from "@/lib/owners";
import { rapportAdminApp } from "./admin";

// Clé web publique du projet des comptes (même valeur que lib/rapport.ts).
const RAPPORT_WEB_KEY = "AIzaSyABOcipg9S2LNSx-MBYa66xYBJA2E2MYdM";

export interface CrmUser {
  uid: string;
  email: string;
  isAdmin: boolean;
}

function bearer(req: NextRequest): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

/** Membre du CRM : propriétaire, admin, ajouté par un admin, ou compte de l'équipe d'origine. */
export async function memberStatus(uid: string, email: string, createdAt?: string) {
  const app = rapportAdminApp();
  if (!app) return { member: true, isAdmin: isOwnerEmail(email) };
  const snap = await getFirestore(app).collection("users").doc(uid).get();
  const data = snap.data() ?? {};
  const isAdmin = isOwnerEmail(email) || data.isAdmin === true;
  const legacy = !!createdAt && createdAt < MEMBERS_CUTOFF;
  const member = data.isBot !== true && data.disabled !== true && (isAdmin || data.member === true || legacy);
  return { member, isAdmin };
}

/** Vérifie le jeton Firebase de la requête. Renvoie null si absent, invalide ou si le compte n'est pas membre. */
export async function verifyCrmUser(req: NextRequest): Promise<CrmUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const app = rapportAdminApp();
  try {
    if (app) {
      const decoded = await getAuth(app).verifyIdToken(token, true);
      const record = await getAuth(app).getUser(decoded.uid);
      const createdAt = new Date(record.metadata.creationTime).toISOString();
      const { member, isAdmin } = await memberStatus(decoded.uid, decoded.email ?? "", createdAt);
      return member ? { uid: decoded.uid, email: decoded.email ?? "", isAdmin } : null;
    }
    // Sans compte de service : simple vérification du jeton auprès de Google.
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${RAPPORT_WEB_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: { localId: string; email?: string }[] };
    const u = data.users?.[0];
    return u ? { uid: u.localId, email: u.email ?? "", isAdmin: isOwnerEmail(u.email) } : null;
  } catch {
    return null;
  }
}

export const unauthorized = () => Response.json({ error: "Non autorisé : connecte-toi au CRM." }, { status: 401 });
