import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from "firebase/firestore/lite";
import { crmDb } from "./db";
import { getSignatureStatus } from "./yousign";

const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

type Rec = {
  id: string;
  yousignId: string;
  docType: string;
  contactId: string;
  status: string;
  signers: { name: string; email: string; status: string }[];
  signedAt?: string;
};

const FINAL_TEXT: Record<string, string> = {
  done: "signé par toutes les parties",
  declined: "refusé par un signataire",
  expired: "expiré sans signature",
  canceled: "annulé",
};

export async function logContactActivity(contactId: string, text: string) {
  if (!contactId) return;
  const t = new Date().toISOString();
  const id = makeId("act");
  await setDoc(doc(await crmDb(), "activities", id), { id, contactId, type: "email", text, at: t, auto: true, createdAt: t, updatedAt: t });
}

export async function findByYousignId(yousignId: string): Promise<Rec | null> {
  const snap = await getDocs(query(collection(await crmDb(), "signatures"), where("yousignId", "==", yousignId), limit(1)));
  return snap.empty ? null : (snap.docs[0].data() as Rec);
}

export async function getRecord(id: string): Promise<Rec | null> {
  const snap = await getDoc(doc(await crmDb(), "signatures", id));
  return snap.exists() ? (snap.data() as Rec) : null;
}

/** Relit le statut chez Yousign, met à jour la fiche et note le résultat final dans l'historique du contact. */
export async function refreshRecord(rec: Rec): Promise<Rec> {
  const s = await getSignatureStatus(rec.yousignId);
  // Yousign renvoie tous les signataires, y compris ceux fixés dans le modèle (ex. Netforce).
  const signers = s.signers.length
    ? s.signers.map((y) => ({ name: y.name || rec.signers.find((x) => x.email === y.email)?.name || y.email, email: y.email, status: y.status }))
    : rec.signers;
  const now = new Date().toISOString();
  const changed = s.status !== rec.status || JSON.stringify(signers) !== JSON.stringify(rec.signers);
  const next: Rec = { ...rec, status: s.status, signers, ...(s.status === "done" && !rec.signedAt ? { signedAt: now } : {}) };
  if (changed) {
    await updateDoc(doc(await crmDb(), "signatures", rec.id), { ...next, updatedAt: now });
    if (s.status !== rec.status && FINAL_TEXT[s.status]) {
      await logContactActivity(rec.contactId, `${rec.docType} ${FINAL_TEXT[s.status]} (Yousign).`);
    }
  }
  return next;
}
