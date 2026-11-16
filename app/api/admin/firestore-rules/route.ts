import { NextRequest } from "next/server";
import { getSecurityRules } from "firebase-admin/security-rules";
import { crmAdminApp } from "@/lib/server/admin";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { CRM_RULES, sameRules } from "@/lib/server/crmRules";

// Publie les règles de sécurité du CRM (firebase/crm.firestore.rules) sur la base Firestore du projet crm-netforce,
// avec le compte de service du serveur. Réservé aux admins.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Réservé aux admins." }, { status: 403 });
  const crm = crmAdminApp();
  if (!crm) return Response.json({ error: "FIREBASE_SERVICE_ACCOUNT_CRM absente." }, { status: 503 });
  try {
    const rules = getSecurityRules(crm);
    const before = await rules.getFirestoreRuleset().catch(() => null);
    if (before && sameRules(before.source.map((f) => f.content).join("\n"))) {
      return Response.json({ ok: true, already: true, publishedAt: before.createTime });
    }
    const r = await rules.releaseFirestoreRulesetFromSource(CRM_RULES);
    return Response.json({ ok: true, already: false, publishedAt: r.createTime });
  } catch (e) {
    console.error("[firestore-rules]", e);
    return Response.json({ error: `Publication refusée par Google : ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
