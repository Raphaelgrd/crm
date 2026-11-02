import { NextRequest } from "next/server";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escapeHtml";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { listFolders, listShares, saveShare, storageError, type ShareRecord } from "@/lib/server/dataroom";
import { newShareId, shareUrl } from "@/lib/server/shares";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DURATIONS = [1, 3, 7, 14, 30, 90];

async function adminAndFolder(req: NextRequest, ctx: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return { res: unauthorized() };
  if (!user.isAdmin) return { res: Response.json({ error: "Seul un admin peut partager une Data Room." }, { status: 403 }) };
  const id = (await ctx.params).id;
  const found = (await listFolders()).find((f) => f.id === id);
  if (!found) return { res: Response.json({ error: "Data Room introuvable." }, { status: 404 }) };
  return { user, folder: found };
}

const publicShare = (s: ShareRecord) => ({
  id: s.id,
  email: s.email,
  expiresAt: s.expiresAt,
  createdAt: s.createdAt,
  createdBy: s.createdBy,
  activatedAt: s.activatedAt ?? null,
  lastOpenedAt: s.lastOpenedAt ?? null,
  opens: s.opens ?? 0,
});

/** Invités de la Data Room (partages actifs, les plus récents d'abord). */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const r = await adminAndFolder(req, ctx);
    if ("res" in r) return r.res;
    const now = Date.now();
    const shares = (await listShares())
      .filter((s) => s.folderId === r.folder.id && !s.revoked && new Date(s.expiresAt).getTime() > now)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicShare);
    return Response.json({ shares });
  } catch (e) {
    return storageError(e);
  }
}

/** Partage la Data Room avec une adresse email pour une durée limitée, et envoie le lien. */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const r = await adminAndFolder(req, ctx);
    if ("res" in r) return r.res;
    const b = (await req.json()) as { email?: unknown; days?: unknown; message?: unknown; senderName?: unknown };
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const days = Number(b.days);
    const message = typeof b.message === "string" ? b.message.trim().slice(0, 1000) : "";
    const senderName = (typeof b.senderName === "string" && b.senderName.trim().slice(0, 60)) || "L'équipe Netforce";
    if (!EMAIL.test(email)) return Response.json({ error: "Adresse email invalide." }, { status: 400 });
    if (!DURATIONS.includes(days)) return Response.json({ error: "Durée invalide." }, { status: 400 });

    const now = new Date();
    const share: ShareRecord = {
      id: newShareId(),
      folderId: r.folder.id,
      email,
      expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
      createdAt: now.toISOString(),
      createdBy: r.user.email,
    };
    await saveShare(share);
    const url = shareUrl(share.id);

    let emailed = false;
    let emailError = "";
    if (process.env.RESEND_API_KEY) {
      const until = new Date(share.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
<p style="font-size:16px">Bonjour,</p>
<p style="font-size:15px;line-height:1.55">${escapeHtml(senderName)} vous donne accès à la Data Room <strong>« ${escapeHtml(r.folder.name)} »</strong> de Netforce.</p>
${message ? `<p style="font-size:15px;line-height:1.55;background:#f1f5f9;border-radius:8px;padding:12px 14px">${escapeHtml(message).replace(/\n/g, "<br/>")}</p>` : ""}
<p style="margin:28px 0"><a href="${url}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Ouvrir la Data Room</a></p>
<p style="font-size:13px;color:#475569;line-height:1.5">Votre accès invité est créé automatiquement à votre première visite, avec cette adresse email. Il est valable jusqu'au <strong>${until}</strong>. Les documents sont confidentiels : merci de ne pas transférer ce lien.</p>
</div>`;
      // Version texte en plus du HTML : les messageries notent mieux les emails qui ont les deux.
      const text = [
        "Bonjour,",
        "",
        `${senderName} vous donne accès à la Data Room « ${r.folder.name} » de Netforce.`,
        ...(message ? ["", message] : []),
        "",
        `Ouvrir la Data Room : ${url}`,
        "",
        `Votre accès invité est créé automatiquement à votre première visite, avec cette adresse email. Il est valable jusqu'au ${until}.`,
        "Les documents sont confidentiels : merci de ne pas transférer ce lien.",
      ].join("\n");
      try {
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: `${senderName} · Netforce <contact@mail.netforce-defense.com>`,
          to: email,
          replyTo: r.user.email || undefined,
          subject: `Accès à la Data Room « ${r.folder.name} » — Netforce`,
          html,
          text,
        });
        if (error) emailError = error.message;
        else emailed = true;
      } catch (e) {
        emailError = e instanceof Error ? e.message : "service d'email injoignable";
      }
    } else {
      emailError = "envoi d'emails non configuré (RESEND_API_KEY)";
    }
    return Response.json({ share: publicShare(share), url, emailed, emailError });
  } catch (e) {
    return storageError(e);
  }
}
