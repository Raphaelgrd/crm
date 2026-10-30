"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";
import { authFetch, useCrmUser } from "@/lib/rapport";

// Fichiers de la Data Room enregistrés en ligne (Firebase) via les routes /api/dataroom du serveur :
// visibles par toute l'équipe, depuis n'importe quel ordinateur. Contenu envoyé en morceaux de 900 Ko.
// Les anciens fichiers restés dans ce navigateur (IndexedDB) se mettent en ligne via migrateLocal.

export interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  folder: string; // "" = racine
  createdAt: string;
  /** URL d'aperçu (object URL) pour les petites images, générée au chargement. */
  url?: string;
  /** Encore seulement dans ce navigateur (pas encore en ligne). */
  local?: boolean;
}

interface FileMeta extends Omit<StoredFile, "url" | "local"> {
  chunks: number;
}

export interface FolderMeta {
  id: string;
  name: string;
  visibility: "public" | "private";
  sharedWith: string[]; // emails des utilisateurs CRM ayant accès
  createdAt: string;
}

/** Taille maximale d'un fichier. */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
const CHUNK = 900_000;

const folderStore = createCollectionStore<FolderMeta>("dataroom_folders");

function makeId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeFolderId(name: string) {
  return `folder_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
}

/** Appel aux routes Data Room, avec 3 essais en cas de coupure réseau ou d'erreur serveur passagère. */
async function api(path: string, init: RequestInit = {}): Promise<Response> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await authFetch(path, init);
      if (res.ok) return res;
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error || `Erreur ${res.status}`;
      // Les erreurs « métier » (4xx) ne se corrigent pas en réessayant.
      if (res.status < 500) throw new Error(msg);
      last = msg;
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError)) throw e;
      last = "Connexion perdue";
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error(`${last}. Réessaie dans un instant.`);
}

async function uploadOne(meta: Omit<FileMeta, "chunks">, blob: Blob): Promise<FileMeta> {
  const chunks = Math.max(1, Math.ceil(blob.size / CHUNK));
  for (let i = 0; i < chunks; i++) {
    const part = blob.size ? blob.slice(i * CHUNK, (i + 1) * CHUNK) : new Blob([new Uint8Array(1)]);
    await api(`/api/dataroom/${meta.id}/chunks/${i}`, { method: "PUT", body: part, headers: { "Content-Type": "application/octet-stream" } });
  }
  const res = await api("/api/dataroom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  return ((await res.json()) as { file: FileMeta }).file;
}

const blobCache = new Map<string, Blob>();

async function downloadBlob(meta: FileMeta): Promise<Blob> {
  const cached = blobCache.get(meta.id);
  if (cached) return cached;
  const parts: ArrayBuffer[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    parts.push(await (await api(`/api/dataroom/${meta.id}/chunks/${i}`)).arrayBuffer());
  }
  // Un fichier vide est stocké comme un octet nul : on le tronque à sa vraie taille.
  const blob = new Blob(parts, { type: meta.mime }).slice(0, meta.size, meta.mime);
  blobCache.set(meta.id, blob);
  return blob;
}

// --- Anciens fichiers locaux (IndexedDB) ---
const DB_NAME = "netforce-dataroom";
const STORE = "files";

interface LocalRecord extends Omit<StoredFile, "url" | "local"> {
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
const localGet = (id: string) => localRun<LocalRecord | undefined>("readonly", (s) => s.get(id) as IDBRequest<LocalRecord | undefined>);
const localPut = (r: LocalRecord) => localRun("readwrite", (s) => s.put(r));

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function useDataRoom() {
  const [metas, setMetas] = useState<FileMeta[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [allFolderMetas, setAllFolderMetas] = useState<FolderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [localFiles, setLocalFiles] = useState<FileMeta[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const urlsRef = useRef<Record<string, string>>({});
  const { user, isAdmin } = useCrmUser();
  const userEmail = (user?.email ?? "").toLowerCase();

  const refresh = useCallback(async () => {
    try {
      const res = await api("/api/dataroom");
      const { files } = (await res.json()) as { files: FileMeta[] };
      setMetas(files.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLocal = useCallback(async () => {
    const records = await localGetAll();
    setLocalFiles(records.map(({ blob: _b, ...m }) => ({ ...m, chunks: 0 })));
    // Aperçus des images locales.
    for (const r of records) {
      if (r.mime.startsWith("image/") && !urlsRef.current[r.id]) {
        const url = URL.createObjectURL(r.blob);
        urlsRef.current[r.id] = url;
        setThumbs((t) => ({ ...t, [r.id]: url }));
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refresh();
    void refreshLocal();
  }, [user, refresh, refreshLocal]);

  // Aperçus des petites images (un seul morceau), chargés une fois chacun.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of metas) {
        if (cancelled) return;
        if (!m.mime.startsWith("image/") || m.chunks > 1 || urlsRef.current[m.id]) continue;
        try {
          const url = URL.createObjectURL(await downloadBlob(m));
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

  // Les fichiers pas encore en ligne restent affichés et utilisables depuis ce navigateur.
  const onlineIds = new Set(metas.map((m) => m.id));
  const pendingLocal = localFiles.filter((m) => !onlineIds.has(m.id));
  const localCount = pendingLocal.length;
  const files: StoredFile[] = [
    ...metas.map(({ chunks: _c, ...m }) => ({ ...m, url: thumbs[m.id] })),
    ...pendingLocal.map(({ chunks: _c, ...m }) => ({ ...m, url: thumbs[m.id], local: true })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totalSize = metas.reduce((s, m) => s + m.size, 0);
  const metaRef = useRef(metas);
  metaRef.current = metas;
  const localRef = useRef(pendingLocal);
  localRef.current = pendingLocal;
  const findMeta = (id: string) => metaRef.current.find((m) => m.id === id);
  const isLocal = (id: string) => localRef.current.some((m) => m.id === id);

  /** Contenu d'un fichier, en ligne ou encore local. */
  const blobOf = async (id: string): Promise<Blob | null> => {
    const meta = findMeta(id);
    if (meta) return downloadBlob(meta);
    return (await localGet(id))?.blob ?? null;
  };

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

  /** Envoie une liste de fichiers, un par un. En cas d'échec, les fichiers restants sont gardés sur cet ordinateur. */
  const putMany = useCallback(
    async (
      items: { file: Blob; name: string; mime: string; folder: string; createdAt?: string; id?: string }[],
      keepLocalOnFailure = true,
    ) => {
      const tooBig = items.filter((x) => x.file.size > MAX_FILE_SIZE);
      const ok = items.filter((x) => x.file.size <= MAX_FILE_SIZE);
      const uploaded: FileMeta[] = [];
      setBusy({ done: 0, total: ok.length });
      try {
        for (const x of ok) {
          const meta = await uploadOne(
            {
              id: x.id ?? makeId(),
              name: x.name,
              mime: x.mime || "application/octet-stream",
              size: x.file.size,
              folder: x.folder,
              createdAt: x.createdAt ?? new Date().toISOString(),
            },
            x.file,
          );
          blobCache.set(meta.id, x.file);
          uploaded.push(meta);
          setBusy({ done: uploaded.length, total: ok.length });
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Envoi impossible.";
        const rest = ok.slice(uploaded.length);
        if (keepLocalOnFailure) {
          // Rien n'est perdu : on garde ces fichiers dans ce navigateur, comme avant.
          for (const x of rest) {
            await localPut({
              id: x.id ?? makeId(),
              name: x.name,
              mime: x.mime || "application/octet-stream",
              size: x.file.size,
              folder: x.folder,
              createdAt: x.createdAt ?? new Date().toISOString(),
              blob: x.file,
            });
          }
          await refreshLocal();
        }
        alert(
          `Mise en ligne impossible pour ${rest.length} fichier${rest.length > 1 ? "s" : ""}${keepLocalOnFailure ? " (gardé" + (rest.length > 1 ? "s" : "") + " sur cet ordinateur)" : ""} : ${reason}`,
        );
      } finally {
        setBusy(null);
        await refresh();
      }
      if (tooBig.length) {
        alert(`Trop lourd (50 Mo max), non envoyé : ${tooBig.map((x) => x.name).join(", ")}`);
      }
      return uploaded;
    },
    [refresh, refreshLocal],
  );

  const uploadFiles = useCallback(
    async (fileList: File[] | FileList, folder: string): Promise<number> => {
      const items = Array.from(fileList);
      await putMany(items.map((f) => ({ file: f, name: f.name, mime: f.type, folder })));
      return items.length;
    },
    [putMany],
  );

  /** Met en ligne les fichiers restés dans ce navigateur ; chacun n'est retiré du navigateur qu'une fois en ligne. */
  const migrateLocal = useCallback(async (): Promise<number> => {
    const records = await localGetAll();
    const online = new Set(metaRef.current.map((m) => m.id));
    const todo = records.filter((r) => !online.has(r.id));
    const uploaded = await putMany(
      todo.map((r) => ({ id: r.id, file: r.blob, name: r.name, mime: r.mime, folder: r.folder, createdAt: r.createdAt })),
      false,
    );
    const done = new Set([...online, ...uploaded.map((m) => m.id)]);
    for (const r of records) if (done.has(r.id)) await localDelete(r.id);
    await refreshLocal();
    return uploaded.length;
  }, [putMany, refreshLocal]);

  const deleteFile = useCallback(
    async (id: string): Promise<void> => {
      if (isLocal(id)) {
        await localDelete(id);
        await refreshLocal();
        return;
      }
      try {
        await api(`/api/dataroom/${id}`, { method: "DELETE" });
        blobCache.delete(id);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Suppression impossible.");
      }
      await refresh();
    },
    [refresh, refreshLocal],
  );

  const patchFile = useCallback(
    async (id: string, patch: { name?: string; folder?: string }): Promise<void> => {
      if (isLocal(id)) {
        const r = await localGet(id);
        if (r) await localPut({ ...r, ...patch });
        await refreshLocal();
        return;
      }
      try {
        await api(`/api/dataroom/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      } catch (e) {
        alert(e instanceof Error ? e.message : "Modification impossible.");
      }
      await refresh();
    },
    [refresh, refreshLocal],
  );

  const renameFile = useCallback(
    async (id: string, name: string): Promise<void> => {
      if ((!findMeta(id) && !isLocal(id)) || !name.trim()) return;
      await patchFile(id, { name: name.trim() });
    },
    [patchFile],
  );

  const moveFile = useCallback(
    async (id: string, folder: string): Promise<void> => {
      if (!findMeta(id) && !isLocal(id)) return;
      await patchFile(id, { folder });
    },
    [patchFile],
  );

  /** Contenu d'un fichier (aperçu, zip). */
  const fileBlob = useCallback((id: string): Promise<Blob | null> => blobOf(id), []);

  const openFile = useCallback(async (id: string): Promise<void> => {
    // Fenêtre ouverte tout de suite : sinon le navigateur la bloque après le téléchargement.
    const win = window.open("", "_blank");
    try {
      const blob = await blobOf(id);
      if (!blob) throw new Error("Fichier introuvable.");
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      win?.close();
      alert(e instanceof Error ? e.message : "Ouverture impossible.");
    }
  }, []);

  const downloadFile = useCallback(async (id: string): Promise<void> => {
    const name = findMeta(id)?.name ?? localRef.current.find((m) => m.id === id)?.name;
    if (!name) return;
    try {
      const blob = await blobOf(id);
      if (!blob) throw new Error("Fichier introuvable.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Téléchargement impossible.");
    }
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
      for (const m of metaRef.current) {
        if (m.folder === name || m.folder.startsWith(name + "/")) await api(`/api/dataroom/${m.id}`, { method: "DELETE" }).catch(() => {});
      }
      for (const m of localRef.current) {
        if (m.folder === name || m.folder.startsWith(name + "/")) await localDelete(m.id);
      }
      await refreshLocal();
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
      // Les fichiers du dossier et de ses sous-dossiers suivent.
      for (const m of metaRef.current) {
        if (m.folder === oldName || m.folder.startsWith(oldName + "/")) {
          await api(`/api/dataroom/${m.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder: clean + m.folder.slice(oldName.length) }),
          }).catch(() => {});
        }
      }
      for (const m of localRef.current) {
        if (m.folder === oldName || m.folder.startsWith(oldName + "/")) {
          const r = await localGet(m.id);
          if (r) await localPut({ ...r, folder: clean + m.folder.slice(oldName.length) });
        }
      }
      await refreshLocal();
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

      await putMany(toPut);
      return toPut.length;
    },
    [allFolderMetas, putMany],
  );

  return {
    files,
    folders,
    folderMetas,
    isAdmin,
    loading,
    loadError,
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
