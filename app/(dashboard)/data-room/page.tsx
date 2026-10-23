"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  FileText,
  FileUp,
  FolderLock,
  FolderOpen,
  FolderPlus,
  Globe,
  Home,
  Lock,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { FolderMeta, StoredFile, formatSize, useDataRoom } from "@/lib/dataroom";

const ACCENT_GRADIENTS = [
  "from-red-400 to-rose-500",
  "from-violet-500 to-purple-500",
  "from-red-400 to-rose-500",
  "from-blue-400 to-indigo-500",
  "from-green-400 to-emerald-500",
  "from-orange-400 to-amber-500",
  "from-pink-400 to-fuchsia-500",
  "from-teal-400 to-cyan-500",
];


function fileIcon(mime: string) {
  if (mime === "application/pdf" || mime.startsWith("text/")) return FileText;
  return FileIcon;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Recursively read all files from a DataTransferItem folder entry
async function getAllFilesFromEntry(
  entry: FileSystemEntry,
  parentPath: string = "",
): Promise<Array<{ file: File; relativePath: string }>> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file((f) => {
        const rel = parentPath ? `${parentPath}/${f.name}` : f.name;
        resolve([{ file: f, relativePath: rel }]);
      });
    });
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry;
    const children = await readAllDirEntries(dir);
    const childPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const results: Array<{ file: File; relativePath: string }> = [];
    for (const child of children) {
      results.push(...(await getAllFilesFromEntry(child, childPath)));
    }
    return results;
  }
  return [];
}

async function readAllDirEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  await new Promise<void>((resolve) => {
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) { resolve(); return; }
        all.push(...batch);
        readBatch();
      });
    }
    readBatch();
  });
  return all;
}

export default function DataRoomPage() {
  const {
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
    setFolderVisibility,
    shareFolderWith,
    unshareFolderWith,
  } = useDataRoom();

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  // currentPath: "" = root, "Kit Marketing FR" = inside Data Room, "Kit Marketing FR/Brochures" = subfolder
  const [currentPath, setCurrentPath] = useState("");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<StoredFile | null>(null);
  const [editingFile, setEditingFile] = useState<StoredFile | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [shareModalFolder, setShareModalFolder] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");

  // Attach webkitdirectory to folder input (not in TS typings)
  useEffect(() => {
    if (folderInput.current) {
      folderInput.current.setAttribute("webkitdirectory", "");
    }
  }, []);


  const isAtRoot = currentPath === "";
  const pathSegments = currentPath ? currentPath.split("/") : [];

  // Files at exactly the current path
  const filesAtPath = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter(
      (f) => f.folder === currentPath && (!q || f.name.toLowerCase().includes(q)),
    );
  }, [files, currentPath, search]);

  // Immediate subfolders at current path (only inside a Data Room)
  const subfolders = useMemo(() => {
    if (isAtRoot) return [];
    const prefix = currentPath + "/";
    const set = new Set<string>();
    for (const f of files) {
      if (f.folder.startsWith(prefix)) {
        const rest = f.folder.slice(prefix.length);
        const first = rest.split("/")[0];
        if (first) set.add(first);
      }
    }
    return Array.from(set).sort();
  }, [files, currentPath, isAtRoot]);

  // Count all files under a given path prefix (recursive)
  const countUnder = (prefix: string) =>
    files.filter((f) => f.folder === prefix || f.folder.startsWith(prefix + "/")).length;

  // Total file counts per top-level Data Room (for root cards)
  const dataRoomCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const meta of folderMetas) {
      map.set(meta.name, countUnder(meta.name));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, folderMetas]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const dtItems = Array.from(e.dataTransfer.items);
    const hasFolder = dtItems.some((item) => {
      const entry = item.webkitGetAsEntry?.();
      return entry?.isDirectory;
    });

    if (hasFolder) {
      const collected: Array<{ file: File; relativePath: string }> = [];
      for (const item of dtItems) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) collected.push(...(await getAllFilesFromEntry(entry, "")));
      }
      if (collected.length > 0) await importFolder(collected, currentPath);
    } else if (e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files, currentPath);
    }
  };

  const shareModalMeta: FolderMeta | undefined = shareModalFolder
    ? folderMetas.find((f) => f.name === shareModalFolder)
    : undefined;

  const navigate = (path: string) => {
    setSearch("");
    setCurrentPath(path);
    setConfirmDelete(null);
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Header */}
      <div className="border-border bg-background/95 border-b px-6 py-5 backdrop-blur-sm lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm flex-wrap">
              <button
                type="button"
                onClick={() => navigate("")}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors ${isAtRoot ? "text-foreground pointer-events-none" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                <Home className="h-3.5 w-3.5" aria-hidden="true" />
                Data Room
              </button>
              {pathSegments.map((seg, i) => {
                const segPath = pathSegments.slice(0, i + 1).join("/");
                const isLast = i === pathSegments.length - 1;
                return (
                  <span key={segPath} className="flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => !isLast && navigate(segPath)}
                      className={`rounded px-1.5 py-0.5 font-medium transition-colors truncate max-w-[160px] ${isLast ? "text-foreground pointer-events-none" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                    >
                      {seg}
                    </button>
                  </span>
                );
              })}
            </div>
            <h1 className="text-foreground mt-1 text-2xl font-bold truncate">
              {isAtRoot ? "Data Room" : pathSegments[pathSegments.length - 1]}
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {isAtRoot
                ? "Gérez vos espaces documentaires sécurisés"
                : `${filesAtPath.length + subfolders.length} élément${filesAtPath.length + subfolders.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isAtRoot ? (
              isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => folderInput.current?.click()}
                    className="border-border bg-card text-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors"
                    title="Importer un dossier entier comme nouvelle Data Room"
                  >
                    <FolderPlus className="h-4 w-4" aria-hidden="true" />
                    Importer un dossier
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNewFolderName(""); setNewFolderOpen(true); }}
                    className="bg-primary text-primary-foreground inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nouvelle Data Room
                  </button>
                </>
              )
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => folderInput.current?.click()}
                  className="border-border bg-card text-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                  title="Importer un dossier entier"
                >
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                  Dossier
                </button>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="bg-primary text-primary-foreground inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                >
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  Fichiers
                </button>
              </>
            )}
            <input ref={fileInput} type="file" multiple className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void uploadFiles(e.target.files, currentPath).then(() => {
                    if (fileInput.current) fileInput.current.value = "";
                  });
                }
              }}
            />
            <input ref={folderInput} type="file" multiple className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void importFolder(
                    Array.from(e.target.files).map((f) => ({
                      file: f,
                      relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
                    })),
                    currentPath,
                  ).then(() => {
                    if (folderInput.current) folderInput.current.value = "";
                  });
                }
              }}
            />
          </div>
        </div>

        {!isAtRoot && (
          <div className="relative mt-4 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un fichier…"
              className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border py-2 pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
        {dragOver && (
          <div className="border-primary bg-primary/5 pointer-events-none fixed inset-x-8 top-40 bottom-8 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed">
            <p className="text-primary text-lg font-semibold">Dépose ici — dossiers et fichiers acceptés</p>
          </div>
        )}

        {/* Root — Data Room cards */}
        {isAtRoot && (
          loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted/50 animate-pulse rounded-xl h-44" />
              ))}
            </div>
          ) : folderMetas.length === 0 ? (
            <div className="border-border rounded-xl border border-dashed py-20 text-center">
              <FolderLock className="mx-auto h-12 w-12 text-gray-300" aria-hidden="true" />
              <p className="text-foreground mt-3 text-sm font-semibold">Aucune Data Room</p>
              {isAdmin ? (
                <button
                  onClick={() => setNewFolderOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle Data Room
                </button>
              ) : (
                <p className="text-muted-foreground mt-1 text-sm">Aucun espace documentaire partagé avec vous.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {folderMetas.map((meta, index) => {
                const count = dataRoomCounts.get(meta.name) ?? 0;
                const isPrivate = meta.visibility === "private";
                const accent = ACCENT_GRADIENTS[index % ACCENT_GRADIENTS.length];
                return (
                  <div
                    key={meta.name}
                    className="group bg-card border-border relative overflow-hidden rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(meta.name)}
                  >
                    <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="rounded-xl bg-orange-50 p-2.5 dark:bg-orange-950/30">
                          <FolderLock className="h-7 w-7 text-orange-500" aria-hidden="true" />
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => void setFolderVisibility(meta.name, isPrivate ? "public" : "private")} className="rounded-lg p-1.5 hover:bg-muted transition-colors" title={isPrivate ? "Rendre public" : "Rendre privé"}>
                              {isPrivate ? <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                            </button>
                            {isPrivate && (
                              <button type="button" onClick={() => { setShareEmail(""); setShareModalFolder(meta.name); }} className="rounded-lg p-1.5 hover:bg-muted transition-colors" title="Partager">
                                <Share2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                              </button>
                            )}
                            {confirmDelete === `folder:${meta.name}` ? (
                              <button type="button" onClick={() => { setConfirmDelete(null); void deleteFolder(meta.name); }} className="rounded-lg bg-red-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-600">Confirmer ?</button>
                            ) : (
                              <button type="button" onClick={() => setConfirmDelete(`folder:${meta.name}`)} className="rounded-lg p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" aria-label={`Supprimer ${meta.name}`}>
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <h3 className="text-foreground mt-3 font-semibold leading-snug">{meta.name}</h3>
                      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {count} document{count !== 1 ? "s" : ""}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isPrivate ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"}`}>
                          {isPrivate ? <Lock className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />}
                          {isPrivate ? "Privé" : "Public"}
                        </span>
                        <span>Créé le {formatDate(meta.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Inside a Data Room — subfolders + files */}
        {!isAtRoot && (
          <div className="space-y-6">
            {/* Subfolders */}
            {subfolders.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wide">Sous-dossiers</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {subfolders.map((name) => {
                    const subPath = `${currentPath}/${name}`;
                    const count = countUnder(subPath);
                    return (
                      <div
                        key={name}
                        className="group bg-card border-border flex cursor-pointer items-center gap-3 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md"
                        onClick={() => navigate(subPath)}
                      >
                        <div className="shrink-0 rounded-lg bg-blue-50 p-2 dark:bg-blue-950/30">
                          <FolderOpen className="h-5 w-5 text-blue-500" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-sm font-semibold">{name}</p>
                          <p className="text-muted-foreground text-xs">{count} fichier{count !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Files */}
            {subfolders.length > 0 && filesAtPath.length > 0 && (
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Fichiers</p>
            )}

            {!loading && filesAtPath.length === 0 && subfolders.length === 0 ? (
              <div className="border-border rounded-xl border border-dashed py-16 text-center">
                <FileUp className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
                <p className="text-foreground mt-3 text-sm font-semibold">
                  {search ? "Aucun fichier ne correspond à la recherche" : "Ce dossier est vide"}
                </p>
                {!search && (
                  <p className="text-muted-foreground mt-1 text-sm">
                    Dépose des fichiers ou dossiers ici, ou utilise les boutons ci-dessus.
                  </p>
                )}
              </div>
            ) : filesAtPath.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {filesAtPath.map((f) => {
                  const Icon = fileIcon(f.mime);
                  return (
                    <div key={f.id} className="group border-border bg-card relative overflow-hidden rounded-xl border shadow-(--shadow-card)">
                      <div
                        className={"bg-muted flex h-28 items-center justify-center overflow-hidden " + (f.url ? "cursor-pointer" : "")}
                        onClick={() => f.url && setLightbox(f)}
                      >
                        {f.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
                        ) : (
                          <Icon className="h-10 w-10 text-gray-300" aria-hidden="true" />
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-foreground truncate text-sm font-semibold" title={f.name}>{f.name}</p>
                        <p className="text-muted-foreground mt-0.5 text-xs">{formatSize(f.size)} — {formatDate(f.createdAt)}</p>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" onClick={() => void openFile(f.id)} className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700" aria-label="Ouvrir"><ExternalLink className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" /></button>
                        <button type="button" onClick={() => { setEditingFile(f); setEditName(f.name); setEditFolder(f.folder); }} className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700" aria-label="Renommer"><Pencil className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" /></button>
                        <button type="button" onClick={() => void downloadFile(f.id)} className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700" aria-label="Télécharger"><Download className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" /></button>
                        {confirmDelete === f.id ? (
                          <button type="button" onClick={() => { setConfirmDelete(null); void deleteFile(f.id); }} className="rounded-lg bg-red-500 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-red-600">Confirmer ?</button>
                        ) : (
                          <button type="button" onClick={() => setConfirmDelete(f.id)} className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-red-50 dark:border-gray-700 dark:bg-gray-800" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5 text-gray-500 hover:text-red-500" aria-hidden="true" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Modale nouvelle Data Room */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNewFolderOpen(false)}>
          <div className="bg-card w-full max-w-sm rounded-xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-foreground mb-4 text-lg font-bold">Nouvelle Data Room</h2>
            <form onSubmit={(e) => { e.preventDefault(); void createFolder(newFolderName).then(() => setNewFolderOpen(false)); }}>
              <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Nom de la Data Room" className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none" />
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setNewFolderOpen(false)} className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors">Annuler</button>
                <button type="submit" className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90">Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale renommer / déplacer */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingFile(null)}>
          <div className="bg-card w-full max-w-sm rounded-xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-foreground mb-4 text-lg font-bold">Modifier le fichier</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = editingFile;
                setEditingFile(null);
                void (async () => {
                  if (editName.trim() && editName !== f.name) await renameFile(f.id, editName);
                  if (editFolder !== f.folder) await moveFile(f.id, editFolder);
                })();
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-foreground mb-1 block text-xs font-medium">Nom</label>
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="border-border bg-card text-foreground focus:border-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-foreground mb-1 block text-xs font-medium">Dossier</label>
                <select value={editFolder} onChange={(e) => setEditFolder(e.target.value)} className="border-border bg-card text-foreground focus:border-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none">
                  <option value="">Racine</option>
                  {folders.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditingFile(null)} className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors">Annuler</button>
                <button type="submit" className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale de partage */}
      {shareModalFolder && shareModalMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShareModalFolder(null)}>
          <div className="bg-card w-full max-w-sm rounded-xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-foreground text-lg font-bold">Partager « {shareModalMeta.name} »</h2>
              <button type="button" onClick={() => setShareModalFolder(null)} className="hover:bg-muted rounded p-1 transition-colors" aria-label="Fermer"><X className="h-5 w-5 text-gray-400" aria-hidden="true" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (!shareEmail.trim()) return; void shareFolderWith(shareModalMeta.name, shareEmail).then(() => setShareEmail("")); }}>
              <label className="text-foreground mb-1 block text-xs font-medium">Ajouter un accès</label>
              <div className="flex gap-2">
                <input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="email@exemple.com" className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 flex-1 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none" />
                <button type="submit" className="bg-primary text-primary-foreground shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90">Ajouter</button>
              </div>
            </form>
            <div className="mt-4">
              <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Accès partagé</p>
              {shareModalMeta.sharedWith.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun partage pour l&apos;instant.</p>
              ) : (
                <ul className="space-y-1">
                  {shareModalMeta.sharedWith.map((email) => (
                    <li key={email} className="bg-muted flex items-center justify-between rounded-lg px-3 py-2">
                      <span className="text-foreground truncate text-sm">{email}</span>
                      <button type="button" onClick={() => void unshareFolderWith(shareModalMeta.name, email)} className="ml-2 shrink-0 rounded p-1 hover:bg-red-50" aria-label={`Révoquer l'accès de ${email}`}><X className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox image */}
      {lightbox?.url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setLightbox(null)}>
          <button type="button" onClick={() => setLightbox(null)} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Fermer l'aperçu"><X className="h-5 w-5" aria-hidden="true" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.name} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
