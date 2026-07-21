"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ⚠️ Stockage local des fichiers dans IndexedDB (le localStorage est limité à
// ~5 Mo, inadapté aux fichiers). API async calquée sur Firebase Storage :
// pour brancher Firebase, seules les fonctions de ce fichier changent.

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

const DB_NAME = "netforce-dataroom";
const STORE = "files";
const FOLDERS_KEY = "netforce.dataroom.folders";

function makeId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function loadFolders(): string[] {
  try {
    const raw = window.localStorage.getItem(FOLDERS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveFolders(folders: string[]) {
  window.localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function useDataRoom() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const urlsRef = useRef<string[]>([]);

  const refresh = useCallback(async () => {
    const records = await dbGetAll();
    // Révoquer les anciennes URLs d'aperçu avant d'en créer de nouvelles
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
    setFolders(loadFolders());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [refresh]);

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

  /** Ouvre le fichier dans un nouvel onglet (PDF, images…). */
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
      const next = Array.from(new Set([...loadFolders(), clean])).sort();
      saveFolders(next);
      setFolders(next);
    },
    [],
  );

  const deleteFolder = useCallback(
    async (name: string): Promise<void> => {
      const records = await dbGetAll();
      for (const r of records) {
        if (r.folder === name) await dbDelete(r.id);
      }
      const next = loadFolders().filter((f) => f !== name);
      saveFolders(next);
      await refresh();
    },
    [refresh],
  );

  return {
    files,
    folders,
    loading,
    uploadFiles,
    deleteFile,
    downloadFile,
    renameFile,
    moveFile,
    openFile,
    createFolder,
    deleteFolder,
  };
}
