import { NextRequest } from "next/server";
import { doc, setDoc } from "firebase/firestore/lite";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { crmDb } from "@/lib/server/db";
import { logContactActivity } from "@/lib/server/signatures";
import { YousignError, listTemplates, sendFromTemplate, yousignConfigured, yousignEnv } from "@/lib/server/yousign";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const fail = (e: unknown) =>
  Response.json({ error: e instanceof YousignError ? e.message : "Yousign injoignable, réessaie." }, { status: 502 });

/** État de la connexion Yousign et modèles disponibles. */
export async function GET(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  if (!yousignConfigured()) return Response.json({ configured: false, env: yousignEnv(), templates: [] });
  try {
    return Response.json({ configured: true, env: yousignEnv(), templates: await listTemplates() });
  } catch (e) {
    return fail(e);
  }
}

/** Envoie un modèle Yousign pour signature et crée la fiche de suivi. */
export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const b = (await req.json()) as {
    templateId?: string;
    templateName?: string;
    contactId?: string;
    contactName?: string;
    company?: string;
    sentBy?: string;
    signers?: { label?: string; firstName?: string; lastName?: string; email?: string }[];
  };

  const templateId = str(b.templateId, 80);
  if (!templateId) return Response.json({ error: "Choisis un modèle." }, { status: 400 });
  const signers = (b.signers ?? []).slice(0, 6).map((s) => ({
    label: str(s.label, 80),
    firstName: str(s.firstName, 80),
    lastName: str(s.lastName, 80),
    email: str(s.email, 160).toLowerCase(),
  }));
  if (!signers.length) return Response.json({ error: "Choisis à qui envoyer." }, { status: 400 });
  for (const s of signers) {
    if (!s.label) return Response.json({ error: "Signataire du modèle manquant." }, { status: 400 });
    if (!s.firstName || !s.lastName) return Response.json({ error: `Prénom et nom obligatoires (${s.label}).` }, { status: 400 });
    if (!EMAIL.test(s.email)) return Response.json({ error: `Email invalide pour ${s.label} : ${s.email || "(vide)"}` }, { status: 400 });
  }

  const templateName = str(b.templateName, 100) || "Document";
  const docType = /\bNDA\b|confidentialit/i.test(templateName) ? "NDA" : /\bMOU\b|m[ée]morandum/i.test(templateName) ? "MOU" : templateName;
  const contactName = str(b.contactName, 120);
  const company = str(b.company, 120);
  const title = `${docType} – ${company || contactName || signers[0].firstName + " " + signers[0].lastName}`;
  const id = `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { id: yousignId } = await sendFromTemplate({ templateId, name: title, externalId: id, signers });
    const now = new Date().toISOString();
    const record = {
      id,
      yousignId,
      env: yousignEnv(),
      docType,
      title,
      contactId: str(b.contactId, 80),
      contactName,
      company,
      signers: signers.map((s) => ({ name: `${s.firstName} ${s.lastName}`, email: s.email, status: "notified" })),
      status: "ongoing",
      sentBy: str(b.sentBy, 80) || user.email,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(await crmDb(), "signatures", id), record);
    await logContactActivity(record.contactId, `${docType} envoyé pour signature via Yousign à ${record.signers.map((s) => s.name).join(", ")}.`);
    return Response.json({ signature: record });
  } catch (e) {
    return fail(e);
  }
}
