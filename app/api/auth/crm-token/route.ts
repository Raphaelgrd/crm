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

/** Diagnostic (à ouvrir dans le navigateur) : les deux comptes de service sont-ils présents et acceptés par Google ? */
export async function GET() {
  const [crm, rapport] = await Promise.all([
    checkServiceAccount("FIREBASE_SERVICE_ACCOUNT_CRM", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ""),
    checkServiceAccount("FIREBASE_SERVICE_ACCOUNT_RAPPORT", "netforce-38edf"),
  ]);
  const ok = crm.status === "ok" && rapport.status === "ok";
  return Response.json(
    {
      diagnostic: ok ? "OK : le serveur peut ouvrir les sessions du CRM." : "PROBLÈME : voir ci-dessous.",
      FIREBASE_SERVICE_ACCOUNT_CRM: crm.status + (crm.project ? ` (projet ${crm.project})` : ""),
      FIREBASE_SERVICE_ACCOUNT_RAPPORT: rapport.status + (rapport.project ? ` (projet ${rapport.project})` : ""),
      attendu: { crm: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "?", rapport: "netforce-38edf" },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
