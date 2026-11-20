"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileText, FolderOpen, Loader2, Send, UserX, X } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";
import { useContacts } from "@/lib/contacts";

interface Share {
  id: string;
  email: string;
  expiresAt: string;
  activatedAt: string | null;
  lastOpenedAt: string | null;
  paths?: string[];
  fileIds?: string[];
}

/** Fichier de la Data Room, avec son chemin relatif à la Data Room ("" = racine). */
export interface RoomFile {
  id: string;
  name: string;
  path: string;
}

export interface ShareScope {
  paths: string[];
  fileIds: string[];
}

/** Description courte de ce qu'un invité voit. */
export function scopeText(s: { paths?: string[]; fileIds?: string[] }, files: RoomFile[]): string {
  const paths = s.paths ?? [];
  const ids = s.fileIds ?? [];
  if (!paths.length && !ids.length) return "Toute la Data Room";
  const names = new Map(files.map((f) => [f.id, f.name]));
  const parts = [...paths.map((p) => `dossier « ${p.split("/").pop()} »`), ...ids.map((id) => `« ${names.get(id) ?? "document supprimé"} »`)];
  return parts.length > 3 ? `${parts.slice(0, 2).join(", ")} et ${parts.length - 2} autres éléments` : parts.join(", ");
}

const DURATIONS = [
  { days: 1, label: "24 heures" },
  { days: 3, label: "3 jours" },
  { days: 7, label: "7 jours" },
  { days: 14, label: "14 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "3 mois" },
];

const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Partage temporaire d'une Data Room, ou de dossiers / fichiers précis, avec une personne extérieure (lien par email). */
export function GuestShareModal({
  folderId,
  folderName,
  onClose,
  files = [],
  initialScope,
}: {
  folderId: string;
  folderName: string;
  onClose: () => void;
  /** Fichiers en ligne de la Data Room (pour choisir une sélection). */
  files?: RoomFile[];
  /** Sélection proposée à l'ouverture (bouton « Partager » d'un dossier ou d'un fichier). */
  initialScope?: ShareScope;
}) {
  const [mode, setMode] = useState<"all" | "some">(initialScope && (initialScope.paths.length || initialScope.fileIds.length) ? "some" : "all");
  const [selPaths, setSelPaths] = useState<string[]>(initialScope?.paths ?? []);
  const [selFiles, setSelFiles] = useState<string[]>(initialScope?.fileIds ?? []);
  const { name } = useCrmUser();
  const { contacts } = useContacts();
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState("");
  const [showList, setShowList] = useState(false);
  const [days, setDays] = useState(7);
  const [message, setMessage] = useState("");
  const [shares, setShares] = useState<Share[] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ email: string; url: string; emailed: boolean; emailError: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Recherche dans les contacts du CRM (prénom, nom, société, email) ; seuls ceux qui ont un email sont proposés.
  const q = email.trim().toLowerCase();
  const matches =
    q.length >= 2 && !picked
      ? contacts
          .filter((c) => c.email && `${c.firstName} ${c.lastName} ${c.lastName} ${c.firstName} ${c.company} ${c.email}`.toLowerCase().includes(q))
          .slice(0, 6)
      : [];

  async function load() {
    try {
      const r = await authFetch(`/api/dataroom/folders/${folderId}/shares`);
      const d = (await r.json()) as { shares?: Share[]; error?: string };
      if (!r.ok) throw new Error(d.error || "Chargement impossible.");
      setShares(d.shares ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
      setShares([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(matches.length ? "Choisis un contact dans la liste, ou tape une adresse email complète." : "Aucun contact trouvé : tape l'adresse email complète.");
      return;
    }
    if (mode === "some" && !selPaths.length && !selFiles.length) {
      setError("Coche au moins un dossier ou un fichier à partager.");
      return;
    }
    setSending(true);
    setError("");
    setResult(null);
    try {
      const r = await authFetch(`/api/dataroom/folders/${folderId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          days,
          message,
          senderName: name,
          ...(mode === "some" ? { paths: selPaths, fileIds: selFiles } : {}),
        }),
      });
      const d = (await r.json()) as { url?: string; emailed?: boolean; emailError?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error || "Partage impossible.");
      setResult({ email: email.trim().toLowerCase(), url: d.url, emailed: !!d.emailed, emailError: d.emailError ?? "" });
      setEmail("");
      setPicked("");
      setMessage("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Partage impossible.");
    } finally {
      setSending(false);
    }
  }

  async function revoke(s: Share) {
    if (!confirm(`Retirer l'accès de ${s.email} à « ${folderName} » ?`)) return;
    try {
      const r = await authFetch(`/api/dataroom/shares/${s.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Retrait impossible.");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Retrait impossible.");
    }
  }

  const input = "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-foreground text-lg font-bold">Partager « {folderName} »</h2>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1" aria-label="Fermer">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>
        <p className="text-muted-foreground mb-5 text-sm">
          La personne reçoit un lien par email. À son premier clic, un compte invité est créé avec son adresse : elle voit et télécharge
          uniquement ce que tu partages, jusqu&apos;à la date choisie.
        </p>

        <form onSubmit={(e) => void send(e)} className="space-y-3">
          <div className="relative space-y-1">
            <label htmlFor="guest-email" className="text-muted-foreground block text-xs">
              Personne : cherche un contact ou tape son email
            </label>
            <input
              id="guest-email"
              type="text"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setPicked("");
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 150)}
              placeholder="Prénom, nom, société ou email"
              className={input}
            />
            {picked && <p className="text-xs text-green-700 dark:text-green-400">Contact du CRM : {picked}</p>}
            {showList && matches.length > 0 && (
              <ul className="border-border bg-card absolute right-0 left-0 z-10 mt-1 overflow-hidden rounded-lg border shadow-lg">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEmail(c.email);
                        setPicked([c.firstName, c.lastName].filter(Boolean).join(" ") + (c.company ? ` · ${c.company}` : ""));
                        setShowList(false);
                      }}
                      className="hover:bg-muted block w-full px-3 py-2 text-left"
                    >
                      <span className="text-foreground block truncate text-sm font-medium">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                        {c.company && <span className="text-muted-foreground font-normal"> · {c.company}</span>}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">{c.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-muted-foreground mb-1 text-xs">Que partager ?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["all", "Toute la Data Room"],
                  ["some", "Une sélection"],
                ] as const
              ).map(([m, label]) => (
                <label
                  key={m}
                  className={
                    "cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium " +
                    (mode === m ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted")
                  }
                >
                  <input type="radio" name="share-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            {mode === "some" && (
              <ScopePicker files={files} paths={selPaths} fileIds={selFiles} onPaths={setSelPaths} onFiles={setSelFiles} />
            )}
          </fieldset>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">Accès pendant</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
              {DURATIONS.map((d) => (
                <option key={d.days} value={d.days}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">Message (facultatif)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={`${input} resize-y`} />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Envoyer l&apos;invitation
          </button>
        </form>

        {result && (
          <div
            className={`mt-4 rounded-lg px-3 py-2.5 text-sm ${result.emailed ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"}`}
          >
            <p>
              {result.emailed
                ? `Invitation envoyée à ${result.email}.`
                : `Accès créé pour ${result.email}, mais l'email n'est pas parti (${result.emailError}). Envoie-lui ce lien toi-même :`}
            </p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(result.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline-offset-2 hover:underline"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? "Lien copié" : "Copier le lien"}
            </button>
          </div>
        )}

        <div className="mt-6">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Invités en cours</p>
          {shares === null ? (
            <Loader2 className="text-primary h-4 w-4 animate-spin" aria-hidden="true" />
          ) : shares.length === 0 ? (
            <p className="text-muted-foreground text-sm">Personne pour l&apos;instant.</p>
          ) : (
            <ul className="divide-border divide-y">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">{s.email}</p>
                    <p className="text-muted-foreground text-xs">
                      {s.activatedAt ? `Compte activé le ${fmt(s.activatedAt)}` : "Lien pas encore ouvert"} · expire le {fmt(s.expiresAt)}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">Accès : {scopeText(s, files)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revoke(s)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Choix des dossiers et fichiers à partager. Cocher un dossier partage tout son contenu, sous-dossiers compris. */
function ScopePicker({
  files,
  paths,
  fileIds,
  onPaths,
  onFiles,
}: {
  files: RoomFile[];
  paths: string[];
  fileIds: string[];
  onPaths: (p: string[]) => void;
  onFiles: (f: string[]) => void;
}) {
  const [q, setQ] = useState("");
  // Tous les dossiers (avec leurs parents), triés pour un affichage en arbre.
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      const segs = f.path ? f.path.split("/") : [];
      for (let i = 1; i <= segs.length; i++) set.add(segs.slice(0, i).join("/"));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [files]);
  // Dossier coché qui contient déjà ce chemin (le chemin lui-même ou un parent).
  const coveredBy = (path: string) => paths.find((p) => path === p || path.startsWith(p + "/"));
  const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
  const needle = q.trim().toLowerCase();
  const rows: { kind: "folder" | "file"; key: string; label: string; depth: number; path: string; id?: string }[] = [];
  const addFiles = (path: string) => {
    for (const f of files.filter((x) => x.path === path).sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
      if (!needle || f.name.toLowerCase().includes(needle)) {
        rows.push({ kind: "file", key: f.id, label: f.name, depth: path ? path.split("/").length : 0, path, id: f.id });
      }
    }
  };
  addFiles("");
  for (const d of folders) {
    if (!needle || d.toLowerCase().includes(needle)) {
      rows.push({ kind: "folder", key: "d:" + d, label: d.split("/").pop() ?? d, depth: d.split("/").length - 1, path: d });
    }
    addFiles(d);
  }
  const count = paths.length + fileIds.length;

  return (
    <div className="border-border rounded-lg border">
      <div className="border-border flex items-center gap-2 border-b px-2 py-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrer les dossiers et fichiers"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          aria-label="Filtrer les dossiers et fichiers"
        />
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {count} sélectionné{count > 1 ? "s" : ""}
        </span>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {!rows.length && <li className="text-muted-foreground px-3 py-2 text-xs">Aucun fichier en ligne dans cette Data Room.</li>}
        {rows.map((r) => {
          // Contenu d'un dossier déjà coché : coché d'office, non modifiable.
          const inherited = r.kind === "folder" ? (parentOf(r.path) ? coveredBy(parentOf(r.path)) : undefined) : r.path ? coveredBy(r.path) : undefined;
          const checked = !!inherited || (r.kind === "folder" ? paths.includes(r.path) : fileIds.includes(r.id!));
          const toggle = () => {
            if (r.kind === "folder") {
              if (paths.includes(r.path)) onPaths(paths.filter((p) => p !== r.path));
              else {
                // Le dossier couvre ses sous-dossiers et fichiers : on les retire de la sélection.
                onPaths([...paths.filter((p) => !p.startsWith(r.path + "/")), r.path]);
                onFiles(fileIds.filter((id) => {
                  const f = files.find((x) => x.id === id);
                  return !f || !(f.path === r.path || f.path.startsWith(r.path + "/"));
                }));
              }
            } else onFiles(fileIds.includes(r.id!) ? fileIds.filter((x) => x !== r.id) : [...fileIds, r.id!]);
          };
          return (
            <li key={r.key}>
              <label
                className={"hover:bg-muted flex cursor-pointer items-center gap-2 py-1 pr-3 text-sm " + (inherited ? "opacity-60" : "")}
                style={{ paddingLeft: 12 + r.depth * 16 }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!!inherited}
                  onChange={toggle}
                  className="accent-blue-600"
                  aria-label={`${r.kind === "folder" ? "Dossier" : "Fichier"} ${r.label}`}
                />
                {r.kind === "folder" ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                ) : (
                  <FileText className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span className={"truncate " + (r.kind === "folder" ? "font-medium" : "")}>{r.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
