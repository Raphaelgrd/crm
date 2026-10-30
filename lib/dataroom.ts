"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bytes, deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { createCollectionStore, db } from "@/lib/firebase";
import { useCrmUser } from "@/lib/rapport";

// Fichiers de la Data Room stockés dans Firestore, partagés avec toute l'équipe :
// métadonnées dans dataroom_files, contenu découpé en morceaux de 900 Ko dans dataroom_chunks
// (un document Firestore est limité à 1 Mo ; gratuit jusqu'à 1 Go au total).
// Les anciens fichiers restés dans le navigateur (IndexedDB) peuvent être mis en ligne via migrateLocal.

export interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  folder: string; // "" = racine
  createdAt: string;
  /** URL d'aperçu (object URL) pour les petites images, générée au chargement. */
  url?: string;
}

interface FileMeta extends Omit<StoredFile, "url"> {
  chunks: number;
  uploadedBy?: string;
}

export interface FolderMeta {
  id: string;
  name: string;
  visibility: "public" | "private";
  sharedWith: string[]; // emails des utilisateurs CRM ayant accès
  createdAt: string;
}

/** Taille maximale d'un fichier (au-delà, l'envoi et la lecture deviennent trop lents). */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
const CHUNK = 900_000;
const THUMB_MAX = CHUNK; // aperçu automatique pour les images d'un seul morceau

const folderStore = createCollectionStore<FolderMeta>("dataroom_folders");
const fileStore = createCollectionStore<FileMeta>("dataroom_files");

function makeId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeFolderId(name: string) {
  return `folder_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
}

const chunkRef = (fileId: string, i: number) => doc(db, "dataroom_chunks", `${fileId}_${i}`);

/** Envoie le contenu puis la fiche : un fichier n'apparaît qu'une fois complet. */
async function putFile(meta: Omit<FileMeta, "chunks">, blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
  for (let i = 0; i < chunks; i++) {
    await setDoc(chunkRef(meta.id, i), { fileId: meta.id, i, data: Bytes.fromUint8Array(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) });
  }
  await fileStore.set({ ...meta, chunks });
}

const blobCache = new Map<string, Blob>();

async function getBlob(meta: FileMeta): Promise<Blob> {
  const cached = blobCache.get(meta.id);
  if (cached) return cached;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const snap = await getDoc(chunkRef(meta.id, i));
    if (!snap.exists()) throw new Error(`Fichier incomplet : ${meta.name}`);
    parts.push((snap.data().data as Bytes).toUint8Array());
  }
  const blob = new Blob(parts as BlobPart[], { type: meta.mime });
  blobCache.set(meta.id, blob);
  return blob;
}

async function removeChunks(meta: FileMeta) {
  for (let i = 0; i < meta.chunks; i++) await deleteDoc(chunkRef(meta.id, i));
  blobCache.delete(meta.id);
}

// --- Anciens fichiers locaux (IndexedDB) ---
const DB_NAME = "netforce-dataroom";
const STORE = "files";

interface LocalRecord extends Omit<StoredFile, "url"> {
  blob: Blob;
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function localRun<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openLocalDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(idb.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    idb.close();
  }
}

const localGetAll = () => localRun<LocalRecord[]>("readonly", (s) => s.getAll() as IDBRequest<LocalRecord[]>).catch(() => [] as LocalRecord[]);
const localDelete = (id: string) => localRun("readwrite", (s) => s.delete(id));

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function useDataRoom() {
  const [metas, setMetas] = useState<FileMeta[]>(fileStore.get());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [allFolderMetas, setAllFolderMetas] = useState<FolderMeta[]>([]);
  const [loading, setLoading] = useState(!fileStore.ready());
  const [localCount, setLocalCount] = useState(0);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const urlsRef = useRef<Record<string, string>>({});
  const { user, isAdmin } = useCrmUser();
  const userEmail = (user?.email ?? "").toLowerCase();

  useEffect(
    () =>
      fileStore.subscribe(() => {
        setMetas([...fileStore.get()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    void localGetAll().then((r) => setLocalCount(r.length));
  }, []);

  // Aperçus des petites images, chargés une seule fois chacun.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of metas) {
        if (cancelled) return;
        if (!m.mime.startsWith("image/") || m.size > THUMB_MAX || urlsRef.current[m.id]) continue;
        try {
          const url = URL.createObjectURL(await getBlob(m));
          urlsRef.current[m.id] = url;
          setThumbs((t) => ({ ...t, [m.id]: url }));
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metas]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const files: StoredFile[] = metas.map(({ chunks: _c, uploadedBy: _u, ...m }) => ({ ...m, url: thumbs[m.id] }));
  const totalSize = metas.reduce((s, m) => s + m.size, 0);

  // Abonnement temps réel aux métadonnées de dossiers dans Firestore
  useEffect(() => {
    return folderStore.subscribe(() => {
      setAllFolderMetas(
        [...folderStore.get()].sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }, []);

  // Dossiers visibles : public, ou admin, ou partagé avec l'utilisateur courant
  const folderMetas = allFolderMetas.filter(
    (f) =>
      f.visibility === "public" ||
      isAdmin ||
      f.sharedWith.map((e) => e.toLowerCase()).includes(userEmail),
  );

  const folders = folderMetas.map((f) => f.name);
  const findMeta = (id: string) => fileStore.get().find((m) => m.id === id);

  /** Envoie une liste de fichiers ; signale ceux trop lourds. */
  const putMany = useCallback(
    async (items: { file: Blob & { name?: string }; name: string; mime: string; folder: string; createdAt?: string; id?: string }[]) => {
      const tooBig = items.filter((x) => x.file.size > MAX_FILE_SIZE);
      const ok = items.filter((x) => x.file.size <= MAX_FILE_SIZE);
      setBusy({ done: 0, total: ok.length });
      let done = 0;
      try {
        for (const x of ok) {
          await putFile(
            {
              id: x.id ?? makeId(),
              name: x.name,
              mime: x.mime || "application/octet-stream",
              size: x.file.size,
              folder: x.folder,
              createdAt: x.createdAt ?? new Date().toISOString(),
              uploadedBy: userEmail,
            },
            x.file,
          );
          setBusy({ done: ++done, total: ok.length });
        }
      } finally {
        setBusy(null);
      }
      if (tooBig.length) {
        alert(`Fichier${tooBig.length > 1 ? "s" : ""} trop lourd${tooBig.length > 1 ? "s" : ""} (50 Mo max), non envoyé${tooBig.length > 1 ? "s" : ""} : ${tooBig.map((x) => x.name).join(", ")}`);
      }
      return done;
    },
    [userEmail],
  );

  const uploadFiles = useCallback(
    (fileList: File[] | FileList, folder: string): Promise<number> =>
      putMany(Array.from(fileList).map((f) => ({ file: f, name: f.name, mime: f.type, folder }))),
    [putMany],
  );

  /** Met en ligne les fichiers restés dans ce navigateur, puis les retire du navigateur. */
  const migrateLocal = useCallback(async (): Promise<number> => {
    const records = await localGetAll();
    const known = new Set(fileStore.get().map((m) => m.id));
    const todo = records.filter((r) => !known.has(r.id));
    const n = await putMany(todo.map((r) => ({ id: r.id, file: r.blob, name: r.name, mime: r.mime, folder: r.folder, createdAt: r.createdAt })));
    const online = new Set(fileStore.get().map((m) => m.id));
    for (const r of records) if (online.has(r.id)) await localDelete(r.id);
    setLocalCount((await localGetAll()).length);
    return n;
  }, [putMany]);

  const deleteFile = useCallback(async (id: string): Promise<void> => {
    const meta = findMeta(id);
    if (!meta) return;
    await fileStore.remove(id);
    await removeChunks(meta);
  }, []);

  const renameFile = useCallback(async (id: string, name: string): Promise<void> => {
    if (!findMeta(id) || !name.trim()) return;
    await fileStore.update(id, { name: name.trim() });
  }, []);

  const moveFile = useCallback(async (id: string, folder: string): Promise<void> => {
    if (!findMeta(id)) return;
    await fileStore.update(id, { folder });
  }, []);

  /** Contenu d'un fichier (pour l'aperçu ou un zip). */
  const fileBlob = useCallback(async (id: string): Promise<Blob | null> => {
    const meta = findMeta(id);
    return meta ? getBlob(meta) : null;
  }, []);

  const openFile = useCallback(async (id: string): Promise<void> => {
    const meta = findMeta(id);
    if (!meta) return;
    // Fenêtre ouverte tout de suite : sinon le navigateur la bloque après le téléchargement.
    const win = window.open("", "_blank");
    try {
      const url = URL.createObjectURL(await getBlob(meta));
      if (win) win.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      win?.close();
      alert(e instanceof Error ? e.message : "Ouverture impossible.");
    }
  }, []);

  const downloadFile = useCallback(async (id: string): Promise<void> => {
    const meta = findMeta(id);
    if (!meta) return;
    const url = URL.createObjectURL(await getBlob(meta));
    const a = document.createElement("a");
    a.href = url;
    a.download = meta.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const createFolder = useCallback(
    async (name: string): Promise<void> => {
      const clean = name.trim();
      if (!clean) return;
      if (allFolderMetas.some((f) => f.name === clean)) return;
      await folderStore.set({
        id: makeFolderId(clean),
        name: clean,
        visibility: "public",
        sharedWith: [],
        createdAt: new Date().toISOString(),
      });
    },
    [allFolderMetas],
  );

  const deleteFolder = useCallback(
    async (name: string): Promise<void> => {
      for (const m of fileStore.get()) {
        if (m.folder === name || m.folder.startsWith(name + "/")) {
          await fileStore.remove(m.id);
          await removeChunks(m);
        }
      }
      const meta = allFolderMetas.find((f) => f.name === name);
      if (meta) await folderStore.remove(meta.id);
    },
    [allFolderMetas],
  );

  const renameFolder = useCallback(
    async (oldName: string, newName: string): Promise<void> => {
      const clean = newName.trim();
      if (!clean || clean === oldName) return;
      if (allFolderMetas.some((f) => f.name === clean)) return;
      // Update Firestore meta
      const meta = allFolderMetas.find((f) => f.name === oldName);
      if (meta) await folderStore.update(meta.id, { name: clean });
      // Les fichiers du dossier et de ses sous-dossiers suivent.
      for (const m of fileStore.get()) {
        if (m.folder === oldName || m.folder.startsWith(oldName + "/")) {
          await fileStore.update(m.id, { folder: clean + m.folder.slice(oldName.length) });
        }
      }
    },
    [allFolderMetas],
  );

  const setFolderVisibility = useCallback(
    async (name: string, visibility: "public" | "private"): Promise<void> => {
      const meta = allFolderMetas.find((f) => f.name === name);
      if (!meta) return;
      await folderStore.update(meta.id, { visibility });
    },
    [allFolderMetas],
  );

  const shareFolderWith = useCallback(
    async (name: string, email: string): Promise<void> => {
      const meta = allFolderMetas.find((f) => f.name === name);
      if (!meta || !email.trim()) return;
      const sharedWith = Array.from(
        new Set([...meta.sharedWith, email.trim().toLowerCase()]),
      );
      await folderStore.update(meta.id, { sharedWith });
    },
    [allFolderMetas],
  );

  const unshareFolderWith = useCallback(
    async (name: string, email: string): Promise<void> => {
      const meta = allFolderMetas.find((f) => f.name === name);
      if (!meta) return;
      const sharedWith = meta.sharedWith.filter(
        (e) => e !== email.trim().toLowerCase(),
      );
      await folderStore.update(meta.id, { sharedWith });
    },
    [allFolderMetas],
  );

  /**
   * Import a folder tree.
   * items: array of { file, relativePath } where relativePath uses "/" as separator
   *   and starts with the selected folder name (same format as webkitRelativePath).
   * basePath: current navigation path ("" = root, "Kit Marketing FR" = inside that Data Room).
   *
   * At root: the first path segment becomes (or reuses) a top-level Data Room.
   * Inside a Data Room: basePath is prepended to the full relative path.
   */
  const importFolder = useCallback(
    async (
      items: Array<{ file: File; relativePath: string }>,
      basePath: string,
    ): Promise<number> => {
      const newDataRooms = new Set<string>();
      const toPut: { file: File; name: string; mime: string; folder: string }[] = [];

      for (const { file, relativePath } of items) {
        const parts = relativePath.split("/").filter(Boolean);
        if (parts.length === 0) continue;
        const fileName = parts[parts.length - 1];
        if (!fileName) continue;

        const folderSegments = parts.slice(0, -1);

        let folderPath: string;
        if (basePath === "") {
          // At root: full path; first segment = Data Room
          folderPath = folderSegments.join("/");
          if (folderSegments.length > 0) newDataRooms.add(folderSegments[0]);
        } else {
          // Inside a Data Room: prepend basePath to relative path
          folderPath =
            folderSegments.length > 0
              ? `${basePath}/${folderSegments.join("/")}`
              : basePath;
        }
        toPut.push({ file, name: fileName, mime: file.type, folder: folderPath });
      }

      // Create any missing top-level Data Rooms
      for (const name of newDataRooms) {
        if (!allFolderMetas.some((f) => f.name === name)) {
          await folderStore.set({
            id: makeFolderId(name),
            name,
            visibility: "public",
            sharedWith: [],
            createdAt: new Date().toISOString(),
          });
        }
      }

      return putMany(toPut);
    },
    [allFolderMetas, putMany],
  );

  /**
   * Recopie la Data Room de l'ancien CRM (netforce.vercel.app) : dossiers recréés avec leurs noms,
   * fichiers téléchargés depuis son stockage puis mis en ligne ici. Relançable sans doublons.
   */
  const importLegacy = useCallback(async (): Promise<{ imported: number; skipped: number; failed: string[] }> => {
    if (!user) throw new Error("Connecte-toi au CRM.");
    const res = await fetch("/api/dataroom/legacy", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    const data = (await res.json()) as { files?: { path: string; name: string; folder: string; mime: string; createdAt: string; url: string }[]; error?: string };
    if (!res.ok || !data.files) throw new Error(data.error || "Lecture de l'ancien CRM impossible.");

    const known = new Set(fileStore.get().map((m) => m.id));
    const legacyId = (path: string) => {
      let h = 0;
      for (let i = 0; i < path.length; i++) h = (Math.imul(31, h) + path.charCodeAt(i)) | 0;
      return `legacy_${(h >>> 0).toString(36)}_${path.length.toString(36)}`;
    };
    const todo = data.files.filter((f) => !known.has(legacyId(f.path)));

    const existing = new Set(folderStore.get().map((f) => f.name));
    for (const name of new Set(todo.map((f) => f.folder.split("/")[0]).filter(Boolean))) {
      if (existing.has(name)) continue;
      await folderStore.set({ id: makeFolderId(name), name, visibility: "private", sharedWith: [], createdAt: new Date().toISOString() });
    }

    const failed: string[] = [];
    let imported = 0;
    setBusy({ done: 0, total: todo.length });
    try {
      for (const f of todo) {
        try {
          const r = await fetch(f.url);
          if (!r.ok) throw new Error(String(r.status));
          imported += await putMany([{ id: legacyId(f.path), file: await r.blob(), name: f.name, mime: f.mime, folder: f.folder, createdAt: f.createdAt }]);
        } catch {
          failed.push(f.name);
        }
        setBusy({ done: imported + failed.length, total: todo.length });
      }
    } finally {
      setBusy(null);
    }
    return { imported, skipped: data.files.length - todo.length, failed };
  }, [user, putMany]);

  return {
    files,
    folders,
    importLegacy,
    folderMetas,
    isAdmin,
    loading,
    totalSize,
    busy,
    localCount,
    migrateLocal,
    fileBlob,
    uploadFiles,
    importFolder,
    deleteFile,
    downloadFile,
    renameFile,
    moveFile,
    openFile,
    createFolder,
    deleteFolder,
    renameFolder,
    setFolderVisibility,
    shareFolderWith,
    unshareFolderWith,
  };
}
