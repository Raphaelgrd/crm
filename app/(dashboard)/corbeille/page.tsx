"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";

// Corbeille : tout ce qui a été supprimé dans le CRM, restaurable pendant 30 jours.

interface Entry {
  id: string;
  kind: string;
  collection: string;
  docId: string;
  label: string;
  data: Record<string, unknown>;
  files?: { id: string; size: number }[];
  deletedAt: string;
  deletedBy: string;
}

const KINDS: Record<string, string> = {
  contacts: "Contact",
  organizations: "Organisation",
  agenda: "Agenda",
  todos: "Tâche",
  activities: "Historique",
  meetings: "Compte rendu",
  templates: "Modèle d'email",
  documentTemplates: "Modèle de document",
  image_bank: "Image",
  loans: "Prêt / envoi",
  segments: "Segment",
  signatures: "Signature",
  countryCompliance: "Conformité export",
  automations: "Automatisation",
  dataroom_files: "Fichier Data Room",
  dataroom_folder: "Data Room",
};
const kindLabel = (k: string) => KINDS[k] ?? k;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function detail(e: Entry): string {
  const d = e.data;
  if (e.kind === "contacts") return [d.company, d.email].filter(Boolean).join(" · ");
  if (e.kind === "dataroom_files") return String(d.folder ?? "");
  if (e.kind === "dataroom_folder") return `${e.files?.length ?? 0} fichier${(e.files?.length ?? 0) > 1 ? "s" : ""}`;
  if (e.kind === "agenda") return String(d.date ?? "");
  return "";
}

export default function TrashPage() {
  const { isAdmin } = useCrmUser();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await authFetch("/api/trash", { cache: "no-store" });
      const j = (await res.json()) as { entries?: Entry[]; days?: number; error?: string };
      if (!res.ok || !j.entries) throw new Error(j.error ?? `Erreur ${res.status}`);
      setEntries(j.entries);
      if (j.days) setDays(j.days);
    } catch (e) {
      setError(`Corbeille illisible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "restore" | "purge" | "empty", ids: string[], key: string) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const res = await authFetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const j = (await res.json()) as { restored?: string[]; errors?: string[]; purged?: number; error?: string };
      if (!res.ok) throw new Error(j.error ?? `Erreur ${res.status}`);
      if (action === "restore") {
        if (j.restored?.length) setNotice(`Restauré : ${j.restored.join(", ")}.`);
        if (j.errors?.length) setError(j.errors.join(" "));
      } else {
        setNotice(`${j.purged ?? 0} élément${(j.purged ?? 0) > 1 ? "s" : ""} supprimé${(j.purged ?? 0) > 1 ? "s" : ""} définitivement.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const kinds = useMemo(() => [...new Set((entries ?? []).map((e) => e.kind))], [entries]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) => (!kind || e.kind === kind) && (!needle || `${e.label} ${detail(e)}`.toLowerCase().includes(needle)),
    );
  }, [entries, q, kind]);

  const daysLeft = (iso: string) => Math.max(0, days - Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Corbeille</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tout ce qui est supprimé dans le CRM reste ici {days} jours, puis disparaît définitivement.
          </p>
        </div>
        {isAdmin && !!entries?.length && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              if (window.confirm(`Vider la corbeille ? Les ${entries.length} éléments seront supprimés définitivement, sans retour possible.`)) {
                void act("empty", [], "empty");
              }
            }}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {busy === "empty" ? "Suppression…" : "Vider la corbeille"}
          </button>
        )}
      </div>

      {notice && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p>}

      {entries && entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="border-border bg-card flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2">
            <Search className="text-muted-foreground h-4 w-4" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher dans la corbeille"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="border-border bg-card rounded-lg border px-3 py-2 text-sm"
            aria-label="Type d'élément"
          >
            <option value="">Tout ({entries.length})</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)} ({entries.filter((e) => e.kind === k).length})
              </option>
            ))}
          </select>
        </div>
      )}

      {!entries && !error && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
        </div>
      )}

      {entries && entries.length === 0 && (
        <div className="border-border bg-card rounded-2xl border p-10 text-center">
          <Trash2 className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="text-foreground font-semibold">La corbeille est vide</p>
          <p className="text-muted-foreground mt-1 text-sm">Les éléments supprimés apparaîtront ici.</p>
        </div>
      )}

      {shown.length > 0 && (
        <ul className="border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border shadow-(--shadow-card)">
          {shown.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                {kindLabel(e.kind)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-semibold">{e.label || "(sans nom)"}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {[detail(e), `supprimé le ${fmt(e.deletedAt)}`, e.deletedBy && `par ${e.deletedBy}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {daysLeft(e.deletedAt)} j restant{daysLeft(e.deletedAt) > 1 ? "s" : ""}
              </span>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void act("restore", [e.id], e.id)}
                  className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {busy === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                  Restaurer
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => {
                      if (window.confirm(`Supprimer définitivement « ${e.label} » ? Impossible de revenir en arrière.`)) {
                        void act("purge", [e.id], `p:${e.id}`);
                      }
                    }}
                    className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Supprimer définitivement ${e.label}`}
                    title="Supprimer définitivement"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {entries && entries.length > 0 && shown.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucun élément ne correspond à la recherche.</p>
      )}
    </div>
  );
}
