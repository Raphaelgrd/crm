import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { Bytes, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore/lite";
import { crmAdminApp } from "./admin";
import type { CrmUser } from "./auth";
import { crmDb } from "./db";

// Data Room côté serveur : les fichiers passent par les routes /api/dataroom. Métadonnées dans dataroom_files,
// contenu en morceaux de 900 Ko dans dataroom_chunks (un document Firestore est limité à 1 Mo).
// Avec le compte de service, on écrit avec l'accès administrateur (indépendant des règles de la base) ;
// sinon avec la session du serveur. L'accès suit la visibilité du dossier.

export const CHUNK_SIZE = 900_000;
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  folder: string;
  createdAt: string;
  chunks: number;
  uploadedBy?: string;
}

interface FolderMeta {
  name: string;
  visibility: "public" | "private";
  sharedWith?: string[];
}

type Data = Record<string, unknown>;

/** Accès minimal aux collections de la Data Room, quel que soit le mode de connexion. */
interface Store {
  get(col: string, id: string): Promise<Data | null>;
  set(col: string, id: string, data: Data): Promise<void>;
  update(col: string, id: string, data: Data): Promise<void>;
  remove(col: string, id: string): Promise<void>;
  list(col: string): Promise<Data[]>;
  bytes(u8: Uint8Array): unknown;
}

async function store(): Promise<Store> {
  const admin = crmAdminApp();
  if (admin) {
    const fs = getAdminFirestore(admin);
    return {
      get: async (c, id) => (await fs.collection(c).doc(id).get()).data() ?? null,
      set: async (c, id, d) => void (await fs.collection(c).doc(id).set(d)),
      update: async (c, id, d) => void (await fs.collection(c).doc(id).update(d)),
      remove: async (c, id) => void (await fs.collection(c).doc(id).delete()),
      list: async (c) => (await fs.collection(c).get()).docs.map((d) => d.data()),
      bytes: (u8) => Buffer.from(u8),
    };
  }
  const db = await crmDb();
  return {
    get: async (c, id) => {
      const s = await getDoc(doc(db, c, id));
      return s.exists() ? s.data() : null;
    },
    set: (c, id, d) => setDoc(doc(db, c, id), d),
    update: (c, id, d) => updateDoc(doc(db, c, id), d),
    remove: (c, id) => deleteDoc(doc(db, c, id)),
    list: async (c) => (await getDocs(collection(db, c))).docs.map((d) => d.data()),
    bytes: (u8) => Bytes.fromUint8Array(u8),
  };
}

/** Contenu d'un morceau, qu'il ait été écrit en mode administrateur (Buffer) ou session (Bytes). */
export function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (v && typeof (v as Bytes).toUint8Array === "function") return (v as Bytes).toUint8Array();
  throw new Error("Contenu illisible.");
}

/** Traduit un refus de Firebase en message compréhensible. */
export function storageError(e: unknown): Response {
  const code = (e as { code?: string | number }).code;
  console.error("[dataroom]", e);
  if (code === "permission-denied" || code === 7) {
    return Response.json(
      {
        error:
          "Firebase refuse l'enregistrement. Il faut ajouter le compte de service FIREBASE_SERVICE_ACCOUNT_CRM dans Vercel (ou autoriser les collections dataroom_files et dataroom_chunks dans les règles Firestore).",
      },
      { status: 403 },
    );
  }
  return Response.json({ error: "Erreur d'enregistrement, réessaie." }, { status: 500 });
}

export const validFileId = (id: string) => /^f_[a-z0-9_]{4,60}$/.test(id);
export const chunkDocId = (fileId: string, i: number) => `${fileId}_${i}`;

/** Le membre peut-il voir ce dossier ? Même règle que l'écran : public, admin, ou partagé avec lui. */
export async function folderAccess(user: CrmUser): Promise<(folder: string) => boolean> {
  if (user.isAdmin) return () => true;
  const metas = (await (await store()).list("dataroom_folders")) as unknown as FolderMeta[];
  const email = user.email.toLowerCase();
  return (folder) => {
    const top = folder.split("/")[0];
    const meta = metas.find((m) => m.name === top);
    if (!top || !meta || meta.visibility !== "private") return true;
    return (meta.sharedWith ?? []).map((e) => e.toLowerCase()).includes(email);
  };
}

export async function listFiles(): Promise<FileMeta[]> {
  return (await (await store()).list("dataroom_files")) as unknown as FileMeta[];
}

export async function getMeta(id: string): Promise<FileMeta | null> {
  if (!validFileId(id)) return null;
  return ((await (await store()).get("dataroom_files", id)) as unknown as FileMeta | null) ?? null;
}

export async function saveMeta(meta: FileMeta) {
  await (await store()).set("dataroom_files", meta.id, { ...meta });
}

export async function updateMeta(id: string, patch: Partial<FileMeta>) {
  await (await store()).update("dataroom_files", id, patch);
}

export async function deleteMeta(id: string) {
  await (await store()).remove("dataroom_files", id);
}

export async function hasChunk(id: string, i: number) {
  return !!(await (await store()).get("dataroom_chunks", chunkDocId(id, i)));
}

export async function saveChunk(id: string, i: number, bytes: Uint8Array, by: string) {
  const s = await store();
  await s.set("dataroom_chunks", chunkDocId(id, i), { fileId: id, i, data: s.bytes(bytes), by });
}

export async function readChunk(id: string, i: number): Promise<Uint8Array | null> {
  const d = await (await store()).get("dataroom_chunks", chunkDocId(id, i));
  return d ? toBytes(d.data) : null;
}

export async function deleteChunks(id: string, chunks: number) {
  const s = await store();
  for (let i = 0; i < chunks; i++) await s.remove("dataroom_chunks", chunkDocId(id, i));
}
