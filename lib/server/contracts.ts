import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { doc, getDoc } from "firebase/firestore/lite";
import { crmDb } from "./db";

// Contrats Netforce pré-remplis par le CRM puis signés via Yousign.
// Le PDF modèle est importé dans le CRM (collection contract_files, le dépôt du code étant public) ;
// les positions ci-dessous correspondent à la mise en page de ce modèle.

export interface ContractData {
  lastName: string;
  firstName: string;
  company: string;
  address: string;
  registration: string;
  jobTitle: string;
  representedBy: string;
  shortName: string;
}

/** Emplacement d'une signature pour Yousign : points depuis le haut-gauche, pages à partir de 1. */
export interface SignatureField {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Text {
  page: number;
  x: number;
  y: number;
  maxWidth: number;
  value: (d: ContractData, date: string) => string;
  size?: number;
  bold?: boolean;
  /** Zone à blanchir avant d'écrire (pointillés ou valeur d'exemple du modèle). */
  erase?: { x: number; width: number };
}

interface Contract {
  id: string;
  name: string;
  /** Textes qui doivent figurer dans le PDF importé, pour refuser un modèle à la mise en page différente. */
  anchors: string[];
  pages: number;
  texts: Text[];
  signatures: { netforce: SignatureField; partner: SignatureField };
}

const upper = (s: string) => s.toLocaleUpperCase("fr-FR");

export const CONTRACTS: Contract[] = [
  {
    id: "NDA",
    name: "NDA – Accord de confidentialité",
    anchors: ["PARTIE RECEPTRICE", "immatriculation", "SIGNATURES", "Partie Réceptrice"],
    pages: 6,
    texts: [
      { page: 1, x: 341, y: 641, maxWidth: 222, value: (d) => upper(d.lastName) },
      { page: 1, x: 361, y: 625.4, maxWidth: 202, value: (d) => d.firstName },
      { page: 1, x: 361, y: 609.8, maxWidth: 202, value: (d) => d.company },
      { page: 1, x: 370, y: 581.7, maxWidth: 193, value: (d) => d.address },
      { page: 1, x: 426, y: 569.1, maxWidth: 137, value: (d) => d.registration, erase: { x: 423, width: 142 } },
      { page: 1, x: 388, y: 556.5, maxWidth: 175, value: (d) => d.representedBy, erase: { x: 385, width: 180 } },
      { page: 1, x: 399, y: 528.4, maxWidth: 77, value: (d) => `« ${d.shortName} »`, erase: { x: 397, width: 80 } },
      { page: 6, x: 138.5, y: 305.8, maxWidth: 70, size: 10.6, value: (_, date) => `${date},`, erase: { x: 137, width: 70 } },
      { page: 6, x: 337, y: 267.2, maxWidth: 220, size: 10, bold: true, value: (d) => d.company },
      { page: 6, x: 343, y: 240.8, maxWidth: 214, size: 10, value: (d) => upper(d.lastName) },
      { page: 6, x: 365, y: 223.5, maxWidth: 192, size: 10, value: (d) => d.firstName },
      { page: 6, x: 357, y: 206.3, maxWidth: 200, size: 10, value: (d) => d.company },
      { page: 6, x: 363, y: 193.1, maxWidth: 194, size: 10, value: (d) => d.jobTitle },
    ],
    signatures: {
      netforce: { page: 6, x: 118, y: 628, width: 170, height: 50 },
      partner: { page: 6, x: 367, y: 628, width: 175, height: 50 },
    },
  },
];

export const findContract = (id: string) => CONTRACTS.find((c) => c.id === id);

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Lit le contrat demandé et les informations du partenaire (partagé par l'envoi et l'aperçu). */
export function readContractBody(b: Record<string, unknown>) {
  const contract = findContract(str(b.contractId, 20));
  if (!contract) return { error: "Contrat inconnu." } as const;
  const d = (b.data ?? {}) as Record<string, unknown>;
  const data: ContractData = {
    lastName: str(d.lastName, 80),
    firstName: str(d.firstName, 80),
    company: str(d.company, 120),
    address: str(d.address, 200),
    registration: str(d.registration, 80),
    jobTitle: str(d.jobTitle, 80),
    representedBy: str(d.representedBy, 120),
    shortName: str(d.shortName, 40),
  };
  return { contract, data } as const;
}

/** Le modèle importé, en octets, ou null s'il n'a pas encore été importé. */
export async function loadContractFile(id: string): Promise<Uint8Array | null> {
  const snap = await getDoc(doc(await crmDb(), "contract_files", id));
  const b64 = snap.exists() ? (snap.data().data as string | undefined) : undefined;
  return b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null;
}

/** Vérifie qu'un PDF importé a bien la mise en page attendue. Renvoie un message d'erreur ou null. */
export async function checkContractFile(contract: Contract, bytes: Uint8Array): Promise<string | null> {
  const { PDFParse } = await import("pdf-parse");
  // pdf.js transfère le buffer qu'on lui donne : on lui passe une copie.
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    const r = await parser.getText();
    if (r.total !== contract.pages) return `Le modèle doit faire ${contract.pages} pages (celui-ci en a ${r.total}).`;
    const missing = contract.anchors.filter((a) => !r.text.includes(a));
    if (missing.length) return `Ce PDF ne ressemble pas au modèle attendu (introuvable : ${missing.join(", ")}).`;
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/** Garde les caractères que la police standard sait écrire (accents français compris). */
function printable(font: PDFFont, s: string): string {
  return [...s.replace(/\s+/g, " ").trim()]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return "?";
      }
    })
    .join("");
}

function write(page: PDFPage, font: PDFFont, t: Text, value: string) {
  let size = t.size ?? 9.5;
  // Réduit la taille jusqu'à ce que le texte tienne, puis coupe si besoin.
  while (size > 6.5 && font.widthOfTextAtSize(value, size) > t.maxWidth) size -= 0.5;
  let v = value;
  while (v.length > 1 && font.widthOfTextAtSize(v, size) > t.maxWidth) v = v.slice(0, -2) + "…";
  page.drawText(v, { x: t.x, y: t.y, size, font, color: rgb(0.05, 0.05, 0.1) });
}

export function formatDate(d = new Date()) {
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const get = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${get("day")} / ${get("month")} / ${get("year")}`;
}

/** Remplit le modèle avec les informations du partenaire. */
export async function fillContract(contract: Contract, template: Uint8Array, data: ContractData, date = formatDate()): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  for (const t of contract.texts) {
    const page = pages[t.page - 1];
    const font = t.bold ? bold : regular;
    const value = printable(font, t.value(data, date));
    if (!value || value === "«  »") continue;
    if (t.erase) {
      const size = t.size ?? 9.5;
      page.drawRectangle({ x: t.erase.x, y: t.y - size * 0.3, width: t.erase.width, height: size * 1.25, color: rgb(1, 1, 1) });
    }
    write(page, font, t, value);
  }
  pdf.setTitle(`${contract.name} – ${data.company || `${data.firstName} ${data.lastName}`}`);
  return pdf.save();
}
