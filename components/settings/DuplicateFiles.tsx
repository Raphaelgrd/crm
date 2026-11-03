"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";
import { formatSize } from "@/lib/dataroom";

// Paramètres → doublons de la Data Room : recherche (contenu comparé octet par octet), puis suppression confirmée.

interface Brief {
  id: string;
  name: string;
  folder: string;
  size: number;
  createdAt: string;
}
interface DupSet {
  keep: Brief;
  remove: Brief[];
}

async function post<T>(body: unknown): Promise<T> {
  // Si o2switch demande une pause, on attend et on réessaie (jusqu'à 5 fois).
  for (let attempt = 0; ; attempt++) {
    const res = await authFetch("/api/dataroom/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let j: T & { error?: string; busy?: boolean };
    try {
      j = (await res.json()) as T & { error?: string; busy?: boolean };
    } catch {
      throw new Error(`Réponse illisible du serveur (${res.status}).`);
    }
    if (res.ok) return j;
    if (j.busy && attempt < 5) {
      await new Promise((r) => setTimeout(r, 30_000 * (attempt + 1)));
      continue;
    }
    throw new Error(j.error ?? `Erreur ${res.status}`);
  }
}

export function DuplicateFiles() {
  const { isAdmin } = useCrmUser();
  const [sets, setSets] = useState<DupSet[] | null>(null);
  const [different, setDifferent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (!isAdmin) return null;

  const search = async () => {
    setBusy(true);
    setError("");
    setDone("");
    setSets(null);
    setDifferent([]);
    try {
      const res = await authFetch("/api/dataroom/duplicates");
      const j = (await res.json()) as { groups?: Brief[][]; error?: string };
      if (!res.ok || !j.groups) throw new Error(j.error ?? `Erreur ${res.status}`);
      const found: DupSet[] = [];
      const diff: string[] = [];
      for (let k = 0; k < j.groups.length; k++) {
        const g = j.groups[k];
        setProgress(`Comparaison du contenu… ${k + 1}/${j.groups.length} : ${g[0].name}`);
        const r = await post<{ sets: DupSet[]; differentContents: boolean }>({ action: "verify", ids: g.map((f) => f.id) });
        found.push(...r.sets.filter((s) => s.remove.length));
        if (r.differentContents) diff.push(`${g[0].folder}/${g[0].name}`);
      }
      setSets(found);
      setDifferent(diff);
      setProgress("");
    } catch (e) {
      setError(`Recherche interrompue : ${e instanceof Error ? e.message : String(e)}`);
      setProgress("");
    } finally {
      setBusy(false);
    }
  };

  const total = sets?.reduce((n, s) => n + s.remove.length, 0) ?? 0;
  const bytes = sets?.reduce((n, s) => n + s.remove.reduce((t, f) => t + f.size, 0), 0) ?? 0;

  const remove = async () => {
    if (!sets?.length) return;
    if (!window.confirm(`Supprimer définitivement ${total} copie${total > 1 ? "s" : ""} en double (${formatSize(bytes)}) ? L'exemplaire le plus ancien de chaque fichier est conservé.`)) return;
    setBusy(true);
    setError("");
    let removed = 0;
    try {
      for (const s of sets) {
        setProgress(`Suppression… ${removed}/${total}`);
        const r = await post<{ removed: string[] }>({ action: "delete", keep: s.keep.id, remove: s.remove.map((f) => f.id) });
        removed += r.removed.length;
      }
      setDone(`${removed} copie${removed > 1 ? "s" : ""} en double supprimée${removed > 1 ? "s" : ""} (${formatSize(bytes)} libérés).`);
      setSets(null);
    } catch (e) {
      setError(`Suppression interrompue après ${removed} copie(s) : ${e instanceof Error ? e.message : String(e)}. Relance la recherche.`);
    } finally {
      setProgress("");
      setBusy(false);
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-foreground flex items-center gap-2 text-base font-bold">
          <Copy className="h-4 w-4 text-gray-400" aria-hidden="true" />
          Fichiers en double dans la Data Room
        </h2>
        <button
          type="button"
          onClick={() => void search()}
          disabled={busy}
          className="border-border text-foreground rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          Rechercher les doublons
        </button>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">
        Même Data Room, même sous-dossier, même nom et contenu identique octet par octet. L&apos;exemplaire le plus ancien est
        gardé. Un même document rangé dans deux Data Rooms différentes n&apos;est pas un doublon.
      </p>

      {progress && <p className="text-foreground text-sm">{progress}</p>}
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      {done && <p className="text-sm font-medium text-emerald-700">{done}</p>}

      {sets && !sets.length && <p className="text-sm text-emerald-700">Aucun doublon : la Data Room est propre.</p>}

      {sets && sets.length > 0 && (
        <div className="space-y-3">
          <ul className="border-border divide-border divide-y rounded-lg border text-sm">
            {sets.map((s) => (
              <li key={s.keep.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-foreground truncate font-medium">{s.keep.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{s.keep.folder}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 tabular-nums">
                  {s.remove.length} copie{s.remove.length > 1 ? "s" : ""} · {formatSize(s.remove.reduce((t, f) => t + f.size, 0))}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Supprimer {total} copie{total > 1 ? "s" : ""} en double ({formatSize(bytes)})
          </button>
        </div>
      )}

      {different.length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs">
          Même nom mais contenu différent (non supprimé) : {different.join(", ")}
        </p>
      )}
    </div>
  );
}
