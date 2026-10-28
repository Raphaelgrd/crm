import { NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { crmAdminApp, rapportAdminApp } from "@/lib/server/admin";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";

// Échange le jeton du compte (projet rapport) contre un jeton du projet CRM :
// les règles Firestore du CRM n'acceptent que les sessions portant `crm: true`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const crm = crmAdminApp();
  if (!crm || !rapportAdminApp()) {
    return Response.json({ error: "Comptes de service Firebase non configurés." }, { status: 503 });
  }
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const token = await getAuth(crm).createCustomToken(user.uid, { crm: true, admin: user.isAdmin });
  return Response.json({ token });
}
