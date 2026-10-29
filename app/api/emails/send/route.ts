import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { escapeHtml } from "@/lib/escapeHtml";
import { unsubscribeUrl, unsubscribedEmails } from "@/lib/server/unsubscribe";

export const runtime = "nodejs";
export const maxDuration = 300;

export interface EmailRecipient {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SendEmailPayload {
  recipients: EmailRecipient[];
  subject: string;
  html: string;
  fromName: string;
  replyTo?: string;
}

export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY non configurée" }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const body: SendEmailPayload = await req.json();
  const { recipients, subject, html, fromName, replyTo } = body;

  if (!recipients?.length || !subject || !html) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const results: { email: string; success: boolean; skipped?: boolean; error?: string }[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  // Les personnes désabonnées ne reçoivent plus rien, quel que soit l'écran d'envoi.
  const optedOut = await unsubscribedEmails();

  for (const recipient of recipients) {
    if (!recipient.email || !recipient.email.includes("@")) {
      results.push({ email: recipient.email, success: false, error: "Email invalide" });
      failed++;
      continue;
    }

    if (optedOut.has(recipient.email.trim().toLowerCase())) {
      results.push({ email: recipient.email, success: false, skipped: true, error: "Désabonné" });
      skipped++;
      continue;
    }

    const unsubLink = unsubscribeUrl(recipient.email);

    const personalizedHtml = html
      .replace(/\{\{prénom\}\}/g, escapeHtml(recipient.firstName || ""))
      .replace(/\{\{nom\}\}/g, escapeHtml(recipient.lastName || ""))
      .replace(/\{\{email\}\}/g, escapeHtml(recipient.email));

    const fullHtml = `${personalizedHtml}
<br/><br/>
<p style="font-size:11px;color:#888;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:24px;">
  Vous recevez cet email car vous faites partie du réseau Netforce Défense.
  <a href="${unsubLink}" style="color:#888;">Se désabonner</a>
</p>`;

    try {
      const { error } = await resend.emails.send({
        from: `${fromName} <contact@mail.netforce-defense.com>`,
        to: recipient.email,
        replyTo: replyTo || undefined,
        subject,
        html: fullHtml,
        // Bouton « Se désabonner » natif de Gmail / Outlook (désabonnement en un clic).
        headers: { "List-Unsubscribe": `<${unsubLink}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      // Resend ne lève pas d'exception : l'échec arrive dans `error`.
      if (error) throw new Error(error.message);
      results.push({ email: recipient.email, success: true });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      results.push({ email: recipient.email, success: false, error: message });
      failed++;
    }

    // Pause 100ms entre chaque mail pour ne pas dépasser le rate limit Resend
    await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({ sent, failed, skipped, results });
}
