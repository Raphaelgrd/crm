import { NextRequest } from "next/server";
import { doc, updateDoc } from "firebase/firestore/lite";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { crmDb } from "@/lib/server/db";
import { getRecord, logContactActivity, refreshRecord } from "@/lib/server/signatures";
import { YousignError, cancelSignature } from "@/lib/server/yousign";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const fail = (e: unknown) =>
  Response.json({ error: e instanceof YousignError ? e.message : "Yousign injoignable, réessaie." }, { status: 502 });

/** Rafraîchit le statut depuis Yousign. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const rec = await getRecord((await params).id);
  if (!rec) return Response.json({ error: "Demande introuvable." }, { status: 404 });
  try {
    return Response.json({ signature: await refreshRecord(rec) });
  } catch (e) {
    return fail(e);
  }
}

/** Annule une demande en cours. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const rec = await getRecord((await params).id);
  if (!rec) return Response.json({ error: "Demande introuvable." }, { status: 404 });
  try {
    await cancelSignature(rec.yousignId);
    await updateDoc(doc(await crmDb(), "signatures", rec.id), { status: "canceled", updatedAt: new Date().toISOString() });
    await logContactActivity(rec.contactId, `${rec.docType} : demande de signature Yousign annulée.`);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
