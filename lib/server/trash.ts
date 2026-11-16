import { store, type Data } from "./store";
import { chunkDocId, type FileMeta } from "./dataroom";
import { remoteDelete } from "./remoteFiles";

// Corbeille du CRM (collection « trash ») : tout élément supprimé y est gardé 30 jours, restaurable.
// Les écrans y déposent leurs suppressions (lib/firebase.ts) ; la Data Room et les automatisations passent par ici.
// Le contenu des fichiers de la Data Room et des images n'est effacé qu'à la suppression définitive.

export const TRASH_DAYS = 30;

export interface TrashEntry {
  id: string;
  /** Collection d'origine, ou "dataroom_folder" pour une Data Room entière. */
  kind: string;
  collection: string;
  docId: string;
  label: string;
  data: Data;
  /** Data Room entière : fiches des fichiers qu'elle contenait. */
  files?: FileMeta[];
  deletedAt: string;
  deletedBy: string;
}

export class TrashError extends Error {}

const newTrashId = (collection: string, docId: string) =>
  `${collection}__${docId}__${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export async function putInTrash(e: Omit<TrashEntry, "id" | "deletedAt">): Promise<string> {
  const id = newTrashId(e.collection, e.docId);
  // Firestore refuse les valeurs undefined : on les retire.
  const entry = JSON.parse(JSON.stringify({ ...e, id, deletedAt: new Date().toISOString() })) as Data;
  await (await store()).set("trash", id, entry);
  return id;
}

/** Fichier de la Data Room : la fiche part à la corbeille, le contenu reste en place jusqu'à la suppression définitive. */
export async function trashDataroomFile(meta: FileMeta, by: string) {
  await putInTrash({ kind: "dataroom_files", collection: "dataroom_files", docId: meta.id, label: meta.name, data: { ...meta }, deletedBy: by });
  await (await store()).remove("dataroom_files", meta.id);
}

/** Data Room entière (dossier et fichiers) en un seul élément de corbeille. */
export async function trashDataroomFolder(folder: Data & { id: string; name: string }, files: FileMeta[], by: string) {
  await putInTrash({
    kind: "dataroom_folder",
    collection: "dataroom_folders",
    docId: folder.id,
    label: folder.name,
    data: { ...folder },
    files,
    deletedBy: by,
  });
  const s = await store();
  for (const f of files) await s.remove("dataroom_files", f.id);
  await s.remove("dataroom_folders", folder.id);
}

export async function listTrash(): Promise<TrashEntry[]> {
  const all = (await (await store()).list("trash")) as unknown as TrashEntry[];
  return all.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

export async function getTrash(id: string): Promise<TrashEntry | null> {
  return ((await (await store()).get("trash", id)) as unknown as TrashEntry | null) ?? null;
}

/** Remet l'élément à sa place d'origine. Refuse si un élément du même identifiant existe déjà. */
export async function restoreTrash(id: string): Promise<TrashEntry> {
  const s = await store();
  const e = await getTrash(id);
  if (!e) throw new TrashError("Élément introuvable dans la corbeille (déjà restauré ou supprimé).");
  if (await s.get(e.collection, e.docId)) throw new TrashError(`« ${e.label} » existe déjà : rien à restaurer.`);
  if (e.kind === "dataroom_folder") {
    const folders = await s.list("dataroom_folders");
    if (folders.some((f) => f.name === e.data.name)) {
      throw new TrashError(`Une Data Room « ${e.label} » existe déjà : renomme-la avant de restaurer celle-ci.`);
    }
    for (const f of e.files ?? []) await s.set("dataroom_files", f.id, { ...f });
  }
  if (e.kind === "dataroom_files") {
    const top = String(e.data.folder ?? "").split("/")[0];
    const folders = await s.list("dataroom_folders");
    if (top && !folders.some((f) => f.name === top)) {
      throw new TrashError(`La Data Room « ${top} » n'existe plus : restaure-la d'abord (elle est peut-être dans la corbeille).`);
    }
  }
  await s.set(e.collection, e.docId, e.data);
  await s.remove("trash", id);
  return e;
}

async function deleteFileContent(meta: FileMeta) {
  if (meta.storage === "o2switch") return remoteDelete(meta.id);
  const s = await store();
  for (let i = 0; i < meta.chunks; i++) await s.remove("dataroom_chunks", chunkDocId(meta.id, i));
}

/** Suppression définitive : efface aussi le contenu des fichiers et des images. */
export async function purgeTrash(id: string): Promise<void> {
  const s = await store();
  const e = await getTrash(id);
  if (!e) return;
  if (e.kind === "dataroom_files") await deleteFileContent(e.data as unknown as FileMeta);
  if (e.kind === "dataroom_folder") for (const f of e.files ?? []) await deleteFileContent(f);
  if (e.kind === "image_bank") await s.remove("image_blobs", e.docId);
  await s.remove("trash", id);
}

/** Supprime définitivement ce qui est dans la corbeille depuis plus de 30 jours. */
export async function purgeExpired(entries: TrashEntry[]): Promise<number> {
  const limit = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  let n = 0;
  for (const e of entries) {
    if (e.deletedAt < limit) {
      await purgeTrash(e.id);
      n++;
    }
  }
  return n;
}
