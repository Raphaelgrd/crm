import { createHash, createHmac } from "node:crypto";
import { safeEqual } from "./apiKey";
import { store } from "./store";

// Désabonnements des emails envoyés depuis le CRM (collection unsubscribes, une entrée par adresse).
// Le lien de désabonnement est signé : on ne peut pas fabriquer celui d'une autre personne.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com";

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || process.env.CRM_API_KEY;
  if (!s) throw new Error("Aucun secret pour signer les liens de désabonnement.");
  return s;
}

const norm = (email: string) => email.trim().toLowerCase();
const sign = (email: string) => createHmac("sha256", secret()).update(`unsubscribe:${norm(email)}`).digest("base64url").slice(0, 32);
const keyOf = (email: string) => createHash("sha256").update(norm(email)).digest("hex").slice(0, 40);

export function unsubscribeUrl(email: string): string {
  return `${APP_URL}/api/emails/unsubscribe?token=${Buffer.from(norm(email)).toString("base64url")}.${sign(email)}`;
}

/** Email contenu dans le lien, ou null s'il est invalide. Les anciens liens non signés restent honorés. */
export function emailFromToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  let email: string;
  try {
    email = Buffer.from(payload ?? "", "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  // Liens envoyés avant la signature : on ne doit pas empêcher quelqu'un de se désabonner.
  if (sig === undefined) return norm(email);
  return safeEqual(sig, sign(email)) ? norm(email) : null;
}

/** Enregistre le désabonnement et le note sur les fiches contact concernées. */
export async function unsubscribe(email: string, source: string): Promise<void> {
  const e = norm(email);
  const db = await store();
  const at = new Date().toISOString();
  await db.set("unsubscribes", keyOf(e), { id: keyOf(e), email: e, at, source });
  const variants = [...new Set([e, email.trim()])];
  for (const v of variants) {
    for (const c of await db.where("contacts", "email", v)) {
      if (c.unsubscribedAt) continue;
      await db.update("contacts", String(c.id), { unsubscribedAt: at, updatedAt: at });
      const id = `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await db.set("activities", id, {
        id,
        contactId: c.id,
        type: "email",
        text: "S'est désabonné des emails Netforce.",
        at,
        auto: true,
        createdAt: at,
        updatedAt: at,
      });
    }
  }
}

/** Adresses désabonnées (en minuscules). */
export async function unsubscribedEmails(): Promise<Set<string>> {
  const all = await (await store()).list("unsubscribes");
  return new Set(all.map((d) => String(d.email ?? "").toLowerCase()));
}
