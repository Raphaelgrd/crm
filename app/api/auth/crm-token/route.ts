import { NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { checkServiceAccount, crmAdminApp, rapportAdminApp } from "@/lib/server/admin";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";

// Échange le jeton du compte (projet rapport) contre un jeton du projet CRM :
// les règles Firestore du CRM n'acceptent que les sessions portant `crm: true`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const crm = crmAdminApp();
  if (!crm || !rapportAdminApp()) {
    const missing = [!crm && "FIREBASE_SERVICE_ACCOUNT_CRM", !rapportAdminApp() && "FIREBASE_SERVICE_ACCOUNT_RAPPORT"].filter(Boolean);
    return Response.json(
      { error: `Session CRM impossible : variable ${missing.join(" et ")} absente ou illisible sur Vercel.`, missing },
      { status: 503 },
    );
  }
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const token = await getAuth(crm).createCustomToken(user.uid, { crm: true, admin: user.isAdmin });
  return Response.json({ token });
}

/**
 * Rejoue le chemin du navigateur avec un compte technique « diagnostic » : jeton du serveur → session Firebase
 * (avec la clé web et l'adresse du site, comme le navigateur) → lecture d'un contact avec cette session.
 */
async function browserPathCheck(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const crm = crmAdminApp();
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  if (!crm) return { "1_jeton": "impossible : FIREBASE_SERVICE_ACCOUNT_CRM" };
  let custom: string;
  try {
    custom = await getAuth(crm).createCustomToken("diagnostic-session", { crm: true, admin: false });
    out["1_jeton"] = "ok";
  } catch (e) {
    return { "1_jeton": `échec : ${e instanceof Error ? e.message : String(e)}` };
  }
  const site = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com";
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: `${site}/`, Origin: site },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = (await r.json().catch(() => ({}))) as { idToken?: string; error?: { message?: string } };
  if (!r.ok || !j.idToken) return { ...out, "2_session_firebase": `échec (${r.status}) : ${j.error?.message ?? "réponse inattendue"}` };
  out["2_session_firebase"] = "ok";
  const f = await fetch(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/contacts?pageSize=1&mask.fieldPaths=id`,
    { headers: { Authorization: `Bearer ${j.idToken}`, Referer: `${site}/` } },
  );
  const fj = (await f.json().catch(() => ({}))) as { documents?: unknown[]; error?: { status?: string; message?: string } };
  out["3_lecture_contacts"] = f.ok ? `ok (${fj.documents?.length ?? 0} contact lu)` : `échec (${f.status}) : ${fj.error?.status ?? ""} ${fj.error?.message ?? ""}`.trim();
  return out;
}

/** Diagnostic (à ouvrir dans le navigateur) : les deux comptes de service sont-ils présents et acceptés par Google ? */
export async function GET() {
  const [crm, rapport] = await Promise.all([
    checkServiceAccount("FIREBASE_SERVICE_ACCOUNT_CRM", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ""),
    checkServiceAccount("FIREBASE_SERVICE_ACCOUNT_RAPPORT", "netforce-38edf"),
  ]);
  const path = await browserPathCheck().catch((e) => ({ erreur: e instanceof Error ? e.message : String(e) }));
  const ok = crm.status === "ok" && rapport.status === "ok" && Object.values(path).every((v) => v.startsWith("ok"));
  return Response.json(
    {
      diagnostic: ok ? "OK : le serveur peut ouvrir les sessions du CRM." : "PROBLÈME : voir ci-dessous.",
      FIREBASE_SERVICE_ACCOUNT_CRM: crm.status + (crm.project ? ` (projet ${crm.project})` : ""),
      FIREBASE_SERVICE_ACCOUNT_RAPPORT: rapport.status + (rapport.project ? ` (projet ${rapport.project})` : ""),
      chemin_du_navigateur: path,
      attendu: { crm: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "?", rapport: "netforce-38edf" },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
