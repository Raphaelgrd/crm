import { NextRequest } from "next/server";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore/lite";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { crmDb } from "@/lib/server/db";
import { CONTRACTS, fillContract, loadContractFile, readContractBody } from "@/lib/server/contracts";
import { logContactActivity } from "@/lib/server/signatures";
import { YousignError, sendForSignature, yousignConfigured, yousignEnv } from "@/lib/server/yousign";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Connexion Yousign, contrats disponibles et signataire Netforce enregistré. */
export async function GET(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const db = await crmDb();
  const contracts = await Promise.all(
    CONTRACTS.map(async (c) => {
      const snap = await getDoc(doc(db, "contract_files", c.id));
      const d = snap.exists() ? snap.data() : null;
      return {
        id: c.id,
        name: c.name,
        uploaded: !!d?.data,
        uploadedAt: (d?.uploadedAt as string) ?? null,
        netforceSigner: (d?.netforceSigner as { firstName: string; lastName: string; email: string } | undefined) ?? null,
      };
    }),
  );
  return Response.json({ configured: yousignConfigured(), env: yousignEnv(), contracts });
}

/** Remplit le contrat avec les infos du partenaire et l'envoie pour signature. */
export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const b = (await req.json()) as Record<string, unknown>;
  const parsed = readContractBody(b);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const { contract, data } = parsed;

  const partnerEmail = str(b.partnerEmail, 160).toLowerCase();
  const ns = (b.netforceSigner ?? {}) as Record<string, unknown>;
  const netforce = { firstName: str(ns.firstName, 80), lastName: str(ns.lastName, 80), email: str(ns.email, 160).toLowerCase() };
  if (!data.firstName || !data.lastName) return Response.json({ error: "Prénom et nom du signataire obligatoires." }, { status: 400 });
  if (!EMAIL.test(partnerEmail)) return Response.json({ error: "Email du signataire invalide." }, { status: 400 });
  if (!netforce.firstName || !netforce.lastName || !EMAIL.test(netforce.email)) {
    return Response.json({ error: "Renseigne le signataire Netforce (prénom, nom, email)." }, { status: 400 });
  }
  if (netforce.email === partnerEmail) return Response.json({ error: "Les deux signataires doivent avoir des emails différents." }, { status: 400 });

  const template = await loadContractFile(contract.id);
  if (!template) return Response.json({ error: `Importe d'abord le modèle PDF du ${contract.id}.` }, { status: 400 });

  const id = `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const label = data.company || `${data.firstName} ${data.lastName}`;
  const title = `${contract.id} – ${label}`;
  try {
    const pdf = await fillContract(contract, template, data);
    const { id: yousignId } = await sendForSignature({
      name: title,
      externalId: id,
      pdf,
      filename: `${contract.id}_${label}.pdf`.replace(/[^\w.\- ]+/g, "_"),
      signers: [
        { ...netforce, field: contract.signatures.netforce },
        { firstName: data.firstName, lastName: data.lastName, email: partnerEmail, field: contract.signatures.partner },
      ],
    });
    const now = new Date().toISOString();
    const record = {
      id,
      yousignId,
      env: yousignEnv(),
      docType: contract.id,
      title,
      contactId: str(b.contactId, 80),
      contactName: `${data.firstName} ${data.lastName}`,
      company: data.company,
      signers: [
        { name: `${netforce.firstName} ${netforce.lastName}`, email: netforce.email, status: "notified" },
        { name: `${data.firstName} ${data.lastName}`, email: partnerEmail, status: "notified" },
      ],
      status: "ongoing",
      sentBy: str(b.sentBy, 80) || user.email,
      createdAt: now,
      updatedAt: now,
    };
    const db = await crmDb();
    await setDoc(doc(db, "signatures", id), record);
    // Le signataire Netforce est retenu pour les prochains envois.
    await updateDoc(doc(db, "contract_files", contract.id), { netforceSigner: netforce }).catch(() => {});
    await logContactActivity(record.contactId, `${contract.id} envoyé pour signature via Yousign (${record.signers.map((s) => s.name).join(", ")}).`);
    return Response.json({ signature: record });
  } catch (e) {
    return Response.json({ error: e instanceof YousignError ? e.message : "Envoi Yousign impossible, réessaie." }, { status: 502 });
  }
}
