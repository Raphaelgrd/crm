import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/server/apiKey";
import { findByYousignId, refreshRecord } from "@/lib/server/signatures";

// Webhook Yousign (à créer dans Yousign → Développeurs → Webhooks, URL :
// https://crm.netforce-defense.com/api/webhooks/yousign). Yousign signe le corps avec
// la clé secrète du webhook (YOUSIGN_WEBHOOK_SECRET) dans l'en-tête X-Yousign-Signature-256.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.YOUSIGN_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "Webhook non configuré." }, { status: 503 });
  const raw = await req.text();
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!safeEqual(req.headers.get("x-yousign-signature-256") ?? "", expected)) {
    return Response.json({ error: "Signature invalide." }, { status: 401 });
  }

  let id = "";
  try {
    const body = JSON.parse(raw) as { data?: { signature_request?: { id?: string } } };
    id = body.data?.signature_request?.id ?? "";
  } catch {}
  if (!id) return Response.json({ ok: true });

  const rec = await findByYousignId(id);
  // Demande créée hors du CRM : rien à suivre.
  if (!rec) return Response.json({ ok: true });
  await refreshRecord(rec);
  return Response.json({ ok: true });
}
