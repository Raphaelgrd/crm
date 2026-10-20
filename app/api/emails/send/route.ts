import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY non configurée" }, { status: 500 });
  }

  const body: SendEmailPayload = await req.json();
  const { recipients, subject, html, fromName, replyTo } = body;

  if (!recipients?.length || !subject || !html) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const results: { email: string; success: boolean; error?: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.email || !recipient.email.includes("@")) {
      results.push({ email: recipient.email, success: false, error: "Email invalide" });
      failed++;
      continue;
    }

    const unsubToken = Buffer.from(recipient.email).toString("base64url");
    const unsubLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com"}/api/emails/unsubscribe?token=${unsubToken}`;

    const personalizedHtml = html
      .replace(/\{\{prénom\}\}/g, recipient.firstName || "")
      .replace(/\{\{nom\}\}/g, recipient.lastName || "")
      .replace(/\{\{email\}\}/g, recipient.email);

    const fullHtml = `${personalizedHtml}
<br/><br/>
<p style="font-size:11px;color:#888;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:24px;">
  Vous recevez cet email car vous faites partie du réseau Netforce Défense.
  <a href="${unsubLink}" style="color:#888;">Se désabonner</a>
</p>`;

    try {
      await resend.emails.send({
        from: `${fromName} <contact@mail.netforce-defense.com>`,
        to: recipient.email,
        replyTo: replyTo || undefined,
        subject,
        html: fullHtml,
      });
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

  return NextResponse.json({ sent, failed, results });
}
