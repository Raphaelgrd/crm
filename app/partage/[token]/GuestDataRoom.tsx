"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Folder, FolderLock, Loader2 } from "lucide-react";
import JSZip from "jszip";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface SharedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  chunks: number;
  path: string;
  createdAt: string;
}

interface ShareData {
  folder: string;
  email: string;
  expiresAt: string;
  files: SharedFile[];
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Espace invité : uniquement la Data Room partagée, en consultation et téléchargement. */
export default function GuestDataRoom({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/partage/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json()) as ShareData & { error?: string };
        if (!r.ok) throw new Error(d.error || "Lien invalide.");
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Lien invalide."));
  }, [token]);

  const groups = useMemo(() => {
    const map = new Map<string, SharedFile[]>();
    for (const f of data?.files ?? []) map.set(f.path, [...(map.get(f.path) ?? []), f]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [data]);

  async function blobOf(f: SharedFile): Promise<Blob> {
    const parts: ArrayBuffer[] = [];
    for (let i = 0; i < f.chunks; i++) {
      const r = await fetch(`/api/partage/${encodeURIComponent(token)}/files/${f.id}/${i}`, { cache: "no-store" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Téléchargement impossible.");
      parts.push(await r.arrayBuffer());
    }
    return new Blob(parts, { type: f.mime }).slice(0, f.size, f.mime);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur, réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const open = (f: SharedFile) => {
    const win = window.open("", "_blank");
    void run(`open:${f.id}`, async () => {
      try {
        const url = URL.createObjectURL(await blobOf(f));
        if (win) win.location.href = url;
        else window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) {
        win?.close();
        throw e;
      }
    });
  };

  const downloadAll = () =>
    run("zip", async () => {
      if (!data) return;
      const zip = new JSZip();
      for (const f of data.files) zip.file(f.path ? `${f.path}/${f.name}` : f.name, await blobOf(f));
      save(await zip.generateAsync({ type: "blob" }), `${data.folder}.zip`);
    });

  return (
    <div className="bg-surface-page min-h-screen">
      <header className="bg-sidebar px-6 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/netforce-logo.svg" alt="Netforce" className="h-7 w-auto" />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {error ? (
          <div className="bg-card border-border rounded-2xl border p-8 text-center shadow-sm">
            <FolderLock className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-foreground font-semibold">Accès indisponible</p>
            <p className="text-muted-foreground mt-1 text-sm">{error}</p>
          </div>
        ) : !data ? (
          <div className="flex justify-center py-20">
            <Loader2 className="text-primary h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Data Room partagée</p>
                <h1 className="text-foreground mt-1 text-2xl font-bold text-balance">{data.folder}</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Accès invité de <strong className="text-foreground">{data.email}</strong>, valable jusqu&apos;au {fmtDate(data.expiresAt)}
                </p>
              </div>
              {data.files.length > 0 && (
                <button
                  type="button"
                  onClick={() => void downloadAll()}
                  disabled={!!busy}
                  className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "zip" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                  Tout télécharger
                </button>
              )}
            </div>

            {data.files.length === 0 ? (
              <p className="bg-card border-border text-muted-foreground rounded-xl border p-6 text-center text-sm">
                Cette Data Room ne contient pas encore de documents.
              </p>
            ) : (
              <div className="space-y-6">
                {groups.map(([path, files]) => (
                  <section key={path || "racine"}>
                    {path && (
                      <h2 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-sm font-semibold">
                        <Folder className="h-4 w-4" aria-hidden="true" />
                        {path}
                      </h2>
                    )}
                    <ul className="bg-card border-border divide-border divide-y overflow-hidden rounded-xl border shadow-sm">
                      {files.map((f) => (
                        <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                          <FileText className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-sm font-medium">{f.name}</p>
                            <p className="text-muted-foreground text-xs">{formatSize(f.size)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => open(f)}
                            disabled={!!busy}
                            className="hover:bg-muted rounded-lg p-2 disabled:opacity-40"
                            aria-label={`Ouvrir ${f.name}`}
                            title="Ouvrir"
                          >
                            {busy === `open:${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void run(`dl:${f.id}`, async () => save(await blobOf(f), f.name))}
                            disabled={!!busy}
                            className="hover:bg-muted rounded-lg p-2 disabled:opacity-40"
                            aria-label={`Télécharger ${f.name}`}
                            title="Télécharger"
                          >
                            {busy === `dl:${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            <p className="text-muted-foreground mt-8 text-center text-xs">Documents confidentiels — merci de ne pas transférer ce lien.</p>
          </>
        )}
      </main>
    </div>
  );
}
