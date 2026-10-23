"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";
import { CRM_ADMINS, useCrmUser } from "@/lib/rapport";

// ⚠️ Fichiers stockés localement dans IndexedDB (voir commentaire d'origine).
// Les métadonnées des dossiers (visibilité, partage) vivent dans Firestore.

export interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  folder: string; // "" = racine
  createdAt: string;
  /** URL d'aperçu (object URL) pour les images, générée au chargement. */
  url?: string;
}

export interface FolderMeta {
  id: string;
  name: string;
  visibility: "public" | "private";
  sharedWith: string[]; // emails des utilisateurs CRM ayant accès
  createdAt: string;
}

/** Emails des administrateurs pouvant gérer la visibilité des dossiers. */
export const DATAROOM_ADMINS = CRM_ADMINS;

const DB_NAME = "netforce-dataroom";
const STORE = "files";

const folderStore = createCollectionStore<FolderMeta>("dataroom_folders");

function makeId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeFolderId(name: string) {
  return `folder_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface FileRecord extends Omit<StoredFile, "url"> {
  blob: Blob;
}

function requestAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<FileRecord[]> {
  const db = await openDb();
  try {
    return await requestAsPromise(
      db.transaction(STORE, "readonly").objectStore(STORE).getAll(),
    );
  } finally {
    db.close();
  }
}

async function dbPut(record: FileRecord): Promise<void> {
  const db = await openDb();
  try {
    await requestAsPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
  } finally {
    db.close();
  }
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    await requestAsPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

async function dbGet(id: string): Promise<FileRecord | undefined> {
  const db = await openDb();
  try {
    return await requestAsPromise(
      db.transaction(STORE, "readonly").objectStore(STORE).get(id),
    );
  } finally {
    db.close();
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function useDataRoom() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [allFolderMetas, setAllFolderMetas] = useState<FolderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const urlsRef = useRef<string[]>([]);
  const { user } = useCrmUser();
  const userEmail = (user?.email ?? "").toLowerCase();
  const isAdmin = DATAROOM_ADMINS.map((e) => e.toLowerCase()).includes(userEmail);

  const refresh = useCallback(async () => {
    const records = await dbGetAll();
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    const list: StoredFile[] = records
      .map(({ blob, ...meta }) => {
        let url: string | undefined;
        if (meta.mime.startsWith("image/")) {
          url = URL.createObjectURL(blob);
          urlsRef.current.push(url);
        }
        return { ...meta, url };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setFiles(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [refresh]);

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

  const uploadFiles = useCallback(
    async (fileList: File[] | FileList, folder: string): Promise<number> => {
      const items = Array.from(fileList);
      for (const f of items) {
        await dbPut({
          id: makeId(),
          name: f.name,
          mime: f.type || "application/octet-stream",
          size: f.size,
          folder,
          createdAt: new Date().toISOString(),
          blob: f,
        });
      }
      await refresh();
      return items.length;
    },
    [refresh],
  );

  const deleteFile = useCallback(
    async (id: string): Promise<void> => {
      await dbDelete(id);
      await refresh();
    },
    [refresh],
  );

  const renameFile = useCallback(
    async (id: string, name: string): Promise<void> => {
      const record = await dbGet(id);
      if (!record || !name.trim()) return;
      await dbPut({ ...record, name: name.trim() });
      await refresh();
    },
    [refresh],
  );

  const moveFile = useCallback(
    async (id: string, folder: string): Promise<void> => {
      const record = await dbGet(id);
      if (!record) return;
      await dbPut({ ...record, folder });
      await refresh();
    },
    [refresh],
  );

  const openFile = useCallback(async (id: string): Promise<void> => {
    const record = await dbGet(id);
    if (!record) return;
    const url = URL.createObjectURL(record.blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, []);

  const downloadFile = useCallback(async (id: string): Promise<void> => {
    const record = await dbGet(id);
    if (!record) return;
    const url = URL.createObjectURL(record.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = record.name;
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
      const records = await dbGetAll();
      for (const r of records) {
        if (r.folder === name) await dbDelete(r.id);
      }
      const meta = allFolderMetas.find((f) => f.name === name);
      if (meta) await folderStore.remove(meta.id);
      await refresh();
    },
    [allFolderMetas, refresh],
  );

  const renameFolder = useCallback(
    async (oldName: string, newName: string): Promise<void> => {
      const clean = newName.trim();
      if (!clean || clean === oldName) return;
      if (allFolderMetas.some((f) => f.name === clean)) return;
      // Update Firestore meta
      const meta = allFolderMetas.find((f) => f.name === oldName);
      if (meta) await folderStore.update(meta.id, { name: clean });
      // Update all file records that live in this folder or subfolders
      const records = await dbGetAll();
      for (const r of records) {
        if (r.folder === oldName || r.folder.startsWith(oldName + "/")) {
          await dbPut({ ...r, folder: clean + r.folder.slice(oldName.length) });
        }
      }
      await refresh();
    },
    [allFolderMetas, refresh],
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
      let count = 0;

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

        await dbPut({
          id: makeId(),
          name: fileName,
          mime: file.type || "application/octet-stream",
          size: file.size,
          folder: folderPath,
          createdAt: new Date().toISOString(),
          blob: file,
        });
        count++;
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

      await refresh();
      return count;
    },
    [allFolderMetas, refresh],
  );

  return {
    files,
    folders,
    folderMetas,
    isAdmin,
    loading,
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
