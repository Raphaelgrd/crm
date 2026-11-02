import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escapeHtml";
import { getShare, listFiles, listFolders, saveShare, updateShare, type FileMeta, type FolderRecord, type ShareRecord } from "./dataroom";

// Liens de partage de Data Room : /partage/sh_<32 caractères aléatoires>. L'identifiant (128 bits) est impossible
// à deviner et ne dépend d'aucune clé : changer une clé d'API ne casse pas les liens déjà envoyés.
// L'enregistrement en base porte l'expiration et la révocation.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com";

export const newShareId = () => `sh_${randomBytes(16).toString("hex")}`;
export const shareUrl = (id: string) => `${APP_URL}/partage/${id}`;

export type ShareAccess =
  | { ok: true; share: ShareRecord; folder: FolderRecord }
  | { ok: false; status: number; error: string };

/** Vérifie un lien de partage : existence, révocation, expiration, Data Room toujours existante. */
export async function checkShareToken(token: string): Promise<ShareAccess> {
  if (!/^sh_[a-f0-9]{32}$/.test(token)) return { ok: false, status: 404, error: "Lien invalide." };
  const share = await getShare(token);
  if (!share) return { ok: false, status: 404, error: "Lien invalide." };
  if (share.revoked) return { ok: false, status: 410, error: "Ce partage a été retiré. Demandez un nouveau lien à Netforce." };
  if (new Date(share.expiresAt).getTime() < Date.now()) {
    return { ok: false, status: 410, error: "Ce lien a expiré. Demandez un nouveau lien à Netforce." };
  }
  const folder = (await listFolders()).find((f) => f.id === share.folderId);
  if (!folder) return { ok: false, status: 410, error: "Cette Data Room n'existe plus." };
  return { ok: true, share, folder };
}

const under = (folder: string, name: string) => folder === name || folder.startsWith(name + "/");

/** Fichiers de la Data Room partagée. */
export async function sharedFiles(folder: FolderRecord): Promise<FileMeta[]> {
  return (await listFiles()).filter((f) => under(f.folder, folder.name));
}

/** Première ouverture = activation du compte invité ; ensuite on note la dernière visite. */
export async function recordOpen(share: ShareRecord) {
  const now = new Date().toISOString();
  await updateShare(share.id, {
    ...(share.activatedAt ? {} : { activatedAt: now }),
    lastOpenedAt: now,
    opens: (share.opens ?? 0) + 1,
  });
}

/** Durées de partage proposées (jours). */
export const SHARE_DURATIONS = [1, 3, 7, 14, 30, 90];

/**
 * Crée l'accès invité à une Data Room et envoie l'invitation par email (Resend).
 * L'accès existe même si l'email ne part pas : le lien est renvoyé pour être transmis à la main.
 */
export async function createGuestShare(opts: {
  folder: FolderRecord;
  email: string;
  days: number;
  message: string;
  senderName: string;
  senderEmail: string;
}): Promise<{ share: ShareRecord; url: string; emailed: boolean; emailError: string }> {
  const { folder, email, days, message, senderName, senderEmail } = opts;
  const now = new Date();
  const share: ShareRecord = {
    id: newShareId(),
    folderId: folder.id,
    email,
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    createdAt: now.toISOString(),
    createdBy: senderEmail,
  };
  await saveShare(share);
  const url = shareUrl(share.id);

  let emailed = false;
  let emailError = "";
  if (process.env.RESEND_API_KEY) {
    const until = new Date(share.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
<p style="font-size:16px">Bonjour,</p>
<p style="font-size:15px;line-height:1.55">${escapeHtml(senderName)} vous donne accès à la Data Room <strong>« ${escapeHtml(folder.name)} »</strong> de Netforce.</p>
${message ? `<p style="font-size:15px;line-height:1.55;background:#f1f5f9;border-radius:8px;padding:12px 14px">${escapeHtml(message).replace(/\n/g, "<br/>")}</p>` : ""}
<p style="margin:28px 0"><a href="${url}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Ouvrir la Data Room</a></p>
<p style="font-size:13px;color:#475569;line-height:1.5">Votre accès invité est créé automatiquement à votre première visite, avec cette adresse email. Il est valable jusqu'au <strong>${until}</strong>. Les documents sont confidentiels : merci de ne pas transférer ce lien.</p>
</div>`;
    // Version texte en plus du HTML : les messageries notent mieux les emails qui ont les deux.
    const text = [
      "Bonjour,",
      "",
      `${senderName} vous donne accès à la Data Room « ${folder.name} » de Netforce.`,
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
        replyTo: senderEmail || undefined,
        subject: `Accès à la Data Room « ${folder.name} » — Netforce`,
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
  return { share, url, emailed, emailError };
}
