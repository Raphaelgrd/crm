"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  Home,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { StoredFile, formatSize, useDataRoom } from "@/lib/dataroom";

function fileIcon(mime: string) {
  if (mime === "application/pdf" || mime.startsWith("text/")) return FileText;
  return FileIcon;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DataRoomPage() {
  const {
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
  } = useDataRoom();

  const fileInput = useRef<HTMLInputElement>(null);
  const [currentFolder, setCurrentFolder] = useState(""); // "" = racine
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // id fichier ou "folder:nom"
  const [lightbox, setLightbox] = useState<StoredFile | null>(null);
  const [editingFile, setEditingFile] = useState<StoredFile | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter(
      (f) => f.folder === currentFolder && (!q || f.name.toLowerCase().includes(q)),
    );
  }, [files, currentFolder, search]);

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) map.set(f.folder, (map.get(f.folder) ?? 0) + 1);
    return map;
  }, [files]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files, currentFolder);
    }
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Data Room</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {files.length} fichier{files.length > 1 ? "s" : ""} —{" "}
              {formatSize(files.reduce((s, f) => s + f.size, 0))} au total
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => {
                setNewFolderName("");
                setNewFolderOpen(true);
              }}
              className="border-border bg-card text-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition-colors"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              Nouveau dossier
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="bg-primary text-primary-foreground inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Importer des fichiers
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void uploadFiles(e.target.files, currentFolder).then(() => {
                    if (fileInput.current) fileInput.current.value = "";
                  });
                }
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Fil d'ariane */}
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setCurrentFolder("")}
              className={
                "inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors " +
                (currentFolder === ""
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              Racine
            </button>
            {currentFolder && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                <span className="text-foreground rounded px-2 py-1 font-semibold">
                  {currentFolder}
                </span>
              </>
            )}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search
              className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un fichier…"
              className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {dragOver && (
          <div className="border-primary bg-primary/5 pointer-events-none fixed inset-x-8 top-40 bottom-8 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed">
            <p className="text-primary text-lg font-semibold">
              Dépose tes fichiers ici
            </p>
          </div>
        )}

        {/* Dossiers (à la racine uniquement) */}
        {currentFolder === "" && folders.length > 0 && (
          <div className="mb-6">
            <p className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
              Dossiers
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {folders.map((name) => (
                <div
                  key={name}
                  className="group border-border bg-card hover:border-primary/40 relative cursor-pointer rounded-xl border p-4 shadow-(--shadow-card) transition-colors"
                  onClick={() => setCurrentFolder(name)}
                >
                  <Folder className="h-8 w-8 fill-blue-100 text-blue-500" aria-hidden="true" />
                  <p className="text-foreground mt-2 truncate text-sm font-semibold">{name}</p>
                  <p className="text-muted-foreground text-xs">
                    {folderCounts.get(name) ?? 0} fichier{(folderCounts.get(name) ?? 0) > 1 ? "s" : ""}
                  </p>
                  {confirmDelete === `folder:${name}` ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(null);
                        void deleteFolder(name);
                      }}
                      className="absolute top-2 right-2 rounded bg-red-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-600"
                    >
                      Confirmer ?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(`folder:${name}`);
                      }}
                      className="absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50"
                      aria-label={`Supprimer le dossier ${name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fichiers */}
        {currentFolder === "" && folders.length > 0 && visibleFiles.length > 0 && (
          <p className="text-muted-foreground mb-3 text-xs font-semibold uppercase">Fichiers</p>
        )}
        {!loading && visibleFiles.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <FileUp className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-foreground mt-3 text-sm font-semibold">
              {search ? "Aucun fichier ne correspond à la recherche" : "Aucun fichier ici"}
            </p>
            {!search && (
              <p className="text-muted-foreground mt-1 text-sm">
                Glisse-dépose des fichiers n&apos;importe où sur la page, ou utilise « Importer ».
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {visibleFiles.map((f) => {
              const Icon = fileIcon(f.mime);
              return (
                <div
                  key={f.id}
                  className="group border-border bg-card relative overflow-hidden rounded-xl border shadow-(--shadow-card)"
                >
                  <div
                    className={
                      "bg-muted flex h-28 items-center justify-center overflow-hidden " +
                      (f.url ? "cursor-pointer" : "")
                    }
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
                    <p className="text-foreground truncate text-sm font-semibold" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatSize(f.size)} — {formatDate(f.createdAt)}
                    </p>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => void openFile(f.id)}
                      className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-gray-50"
                      aria-label="Ouvrir"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFile(f);
                        setEditName(f.name);
                        setEditFolder(f.folder);
                      }}
                      className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-gray-50"
                      aria-label="Renommer ou déplacer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadFile(f.id)}
                      className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-gray-50"
                      aria-label="Télécharger"
                    >
                      <Download className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                    </button>
                    {confirmDelete === f.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(null);
                          void deleteFile(f.id);
                        }}
                        className="rounded-lg bg-red-500 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-red-600"
                      >
                        Confirmer ?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(f.id)}
                        className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:bg-red-50"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-gray-500 hover:text-red-500" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modale nouveau dossier */}
      {newFolderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setNewFolderOpen(false)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-foreground mb-4 text-lg font-bold">Nouveau dossier</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createFolder(newFolderName).then(() => setNewFolderOpen(false));
              }}
            >
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nom du dossier"
                className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(false)}
                  className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale renommer / déplacer */}
      {editingFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditingFile(null)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
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
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="border-border bg-card text-foreground focus:border-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="text-foreground mb-1 block text-xs font-medium">Dossier</label>
                <select
                  value={editFolder}
                  onChange={(e) => setEditFolder(e.target.value)}
                  className="border-border bg-card text-foreground focus:border-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">Racine</option>
                  {folders.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingFile(null)}
                  className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox image */}
      {lightbox?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Fermer l'aperçu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
