import { Resend } from "resend";
import { escapeHtml } from "@/lib/escapeHtml";

// Alerte email à chaque formulaire reçu du site (nouveau prospect ou prospect déjà connu qui réécrit).
// Destinataires : LEAD_NOTIFY_TO (adresses séparées par des virgules), sinon DAILY_REPORT_TO, sinon l'adresse par défaut.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com";

export interface LeadInfo {
  created: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  category: string;
  subjects: string[];
  source: string;
  details: string; // note complète (montant, ville, pays, message…)
}

export function leadRecipients(): string[] {
  return (process.env.LEAD_NOTIFY_TO || process.env.DAILY_REPORT_TO || "gerardraphael01@gmail.com")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Construit l'email d'alerte (exporté pour les tests). */
export function leadEmail(l: LeadInfo) {
  const name = `${l.firstName} ${l.lastName}`.trim();
  const subject = `${l.created ? "Nouveau prospect" : "Prospect déjà connu"} : ${name}${l.company ? ` (${l.company})` : ""} — ${l.category}`;
  const link = `${APP_URL}/contacts?q=${encodeURIComponent(l.email)}`;
  const rows: [string, string][] = [
    ["Nom", name],
    ["Email", l.email],
    ["Téléphone", l.phone],
    ["Société", l.company],
    ["Catégorie", l.category],
    ["Sujet", l.subjects.join(", ")],
    ["Provenance", l.source],
  ].filter((r): r is [string, string] => !!r[1]);
  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px">
<p style="font-size:16px;margin:0 0 12px"><strong>${l.created ? "Nouveau prospect reçu depuis le site" : "Un prospect déjà dans le CRM a renvoyé le formulaire"}</strong></p>
<table style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>
<p style="font-size:14px;line-height:1.55;background:#f1f5f9;border-radius:8px;padding:12px 14px;margin:14px 0">${escapeHtml(l.details).replace(/\n/g, "<br/>")}</p>
<p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Ouvrir dans le CRM</a></p>
<p style="font-size:12px;color:#64748b">Répondre à cet email écrit directement au prospect.</p>
</div>`;
  const text = [
    l.created ? "Nouveau prospect reçu depuis le site" : "Un prospect déjà dans le CRM a renvoyé le formulaire",
    "",
    ...rows.map(([k, v]) => `${k} : ${v}`),
    "",
    l.details,
    "",
    `Ouvrir dans le CRM : ${link}`,
  ].join("\n");
  return { subject, html, text };
}

/** Envoie l'alerte ; ne lève jamais d'erreur (le prospect est déjà enregistré). */
export async function notifyNewLead(l: LeadInfo): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY manquante" };
  try {
    const { subject, html, text } = leadEmail(l);
    const { error } = await new Resend(key).emails.send({
      from: "CRM Netforce <contact@mail.netforce-defense.com>",
      to: leadRecipients(),
      replyTo: l.email,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[lead notify]", error);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (e) {
    console.error("[lead notify]", e);
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
