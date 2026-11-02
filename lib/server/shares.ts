import { randomBytes } from "node:crypto";
import { getShare, listFiles, listFolders, updateShare, type FileMeta, type FolderRecord, type ShareRecord } from "./dataroom";

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
