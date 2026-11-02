import { store } from "./store";

// Stock et prêts de gants côté serveur (assistant IA), même format que les écrans Stock et Prêts & Envois :
// collections "stock" (une référence par doc, id = "impact_beige_M"), "stockMovements" et "loans".

export const GLOVE_TYPES = ["impact", "flex"] as const;
export const GLOVE_COLORS = ["beige", "noir"] as const;
export const GLOVE_SIZES = ["M", "L", "XL", "XXL"] as const;

export class OperationError extends Error {}

const makeId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const label = (type: string, color: string, size: string) =>
  `${type === "impact" ? "Impact" : "Flex"} ${color === "noir" ? "Noir" : "Beige"} — ${size}`;
const parisDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);

export function checkRef(type: string, color: string, size: string) {
  if (!GLOVE_TYPES.includes(type as (typeof GLOVE_TYPES)[number])) throw new OperationError(`Modèle inconnu « ${type} » : impact ou flex.`);
  if (!GLOVE_COLORS.includes(color as (typeof GLOVE_COLORS)[number])) throw new OperationError(`Coloris inconnu « ${color} » : beige ou noir.`);
  if (!GLOVE_SIZES.includes(size as (typeof GLOVE_SIZES)[number])) throw new OperationError(`Taille inconnue « ${size} » : M, L, XL ou XXL.`);
}

/** Entrée ou sortie de stock ; refuse une sortie supérieure au stock. Renvoie la nouvelle quantité. */
export async function moveStock(input: {
  type: string;
  color: string;
  size: string;
  qty: number;
  direction: "in" | "out";
  note: string;
}): Promise<{ sku: string; label: string; before: number; after: number }> {
  checkRef(input.type, input.color, input.size);
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new OperationError("La quantité doit être un nombre entier supérieur à zéro.");
  const db = await store();
  const sku = `${input.type}_${input.color}_${input.size}`;
  const before = Number((await db.get("stock", sku))?.qty ?? 0);
  const after = before + (input.direction === "in" ? input.qty : -input.qty);
  const name = label(input.type, input.color, input.size);
  if (after < 0) throw new OperationError(`Stock insuffisant : il reste ${before} paire${before > 1 ? "s" : ""} en ${name}.`);
  const now = new Date().toISOString();
  await db.set("stock", sku, { id: sku, type: input.type, color: input.color, size: input.size, qty: after, updatedAt: now });
  const mid = makeId("m");
  await db.set("stockMovements", mid, {
    id: mid,
    sku,
    type: input.type,
    color: input.color,
    size: input.size,
    qty: input.qty,
    direction: input.direction,
    note: input.note.trim().slice(0, 300),
    at: now,
  });
  return { sku, label: name, before, after };
}

async function logActivity(contactId: string, text: string) {
  const t = new Date().toISOString();
  const id = makeId("act");
  await (await store()).set("activities", id, { id, contactId, type: "loan", text, at: t, auto: true, createdAt: t, updatedAt: t });
}

/** Prêt (démo, revient) ou envoi définitif de gants à un contact ; sort du stock si demandé. */
export async function createLoan(input: {
  contactId: string;
  kind: "loan" | "shipment";
  type: string;
  color: string;
  size: string;
  qty: number;
  dueAt?: string;
  notes?: string;
  fromStock: boolean;
}) {
  checkRef(input.type, input.color, input.size);
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new OperationError("La quantité doit être un nombre entier supérieur à zéro.");
  const db = await store();
  const contact = await db.get("contacts", input.contactId);
  if (!contact) throw new OperationError(`Contact introuvable : ${input.contactId}. Utilise search_contacts.`);
  const dueAt = input.kind === "loan" ? (input.dueAt ?? "") : "";
  if (input.kind === "loan" && dueAt && !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) throw new OperationError("dueAt doit être au format YYYY-MM-DD.");
  const name = label(input.type, input.color, input.size);
  const contactName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
  if (input.fromStock) {
    await moveStock({
      type: input.type,
      color: input.color,
      size: input.size,
      qty: input.qty,
      direction: "out",
      note: `${input.kind === "loan" ? "Prêt" : "Envoi"} à ${contactName || "un contact"}`,
    });
  }
  const now = new Date().toISOString();
  const loan = {
    id: makeId("pr"),
    contactId: input.contactId,
    contactName,
    company: String(contact.company ?? ""),
    kind: input.kind,
    type: input.type,
    color: input.color,
    size: input.size,
    qty: input.qty,
    loanedAt: parisDay(),
    dueAt,
    returnedAt: "",
    status: input.kind === "loan" ? "out" : "sent",
    stockLinked: input.fromStock,
    feedback: "",
    notes: (input.notes ?? "").trim().slice(0, 1000),
    createdAt: now,
    updatedAt: now,
  };
  await db.set("loans", loan.id, loan);
  await logActivity(
    input.contactId,
    input.kind === "loan"
      ? `Prêt de ${input.qty} paire${input.qty > 1 ? "s" : ""} de G.I.E ${name}${dueAt ? `, retour prévu le ${dueAt}` : ""}.`
      : `Envoi de ${input.qty} paire${input.qty > 1 ? "s" : ""} de G.I.E ${name}.`,
  );
  return loan;
}

/** Retour d'un prêt : le marque rendu, avec le retour terrain, et remet en stock s'il en était sorti. */
export async function returnLoan(loanId: string, feedback: string) {
  const db = await store();
  const loan = await db.get("loans", loanId);
  if (!loan) throw new OperationError(`Prêt introuvable : ${loanId}. Utilise list_loans.`);
  if (loan.kind !== "loan" || loan.status !== "out") throw new OperationError("Ce prêt n'est pas en cours (déjà rendu, ou envoi définitif).");
  if (loan.stockLinked) {
    await moveStock({
      type: String(loan.type),
      color: String(loan.color),
      size: String(loan.size),
      qty: Number(loan.qty),
      direction: "in",
      note: `Retour du prêt de ${loan.contactName || "un contact"}`,
    });
  }
  const now = new Date().toISOString();
  const patch = { status: "returned", returnedAt: parisDay(), feedback: feedback.trim().slice(0, 2000), updatedAt: now };
  await db.update("loans", loanId, patch);
  await logActivity(String(loan.contactId), `Retour du prêt de G.I.E${feedback.trim() ? ` — retour terrain : ${feedback.trim().slice(0, 300)}` : ""}.`);
  return { id: loanId, contactName: String(loan.contactName ?? ""), stockLinked: !!loan.stockLinked, ...patch };
}
