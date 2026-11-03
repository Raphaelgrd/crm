"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";
import { formatSize } from "@/lib/dataroom";

// Paramètres → stockage des fichiers de la Data Room : Firebase (limité à 1 Go gratuit) ou o2switch.

interface Status {
  configured: boolean;
  remote: { ok: true; free: number | null } | { ok: false; error: string } | null;
  firebase: { files: number; bytes: number };
  o2switch: { files: number; bytes: number };
}

const freeSpace = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(0)} Go` : formatSize(bytes);

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: `Réponse illisible du serveur (${res.status}).` } as T & { error?: string };
  }
}

export function FileStorage() {
  const { isAdmin } = useCrmUser();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([]);

  const load = useCallback(async () => {
    setError("");
    const res = await authFetch("/api/dataroom/storage");
    const j = await readJson<Status>(res);
    if (!res.ok) setError(j.error ?? "Impossible de lire l'état du stockage.");
    else setStatus(j);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const transfer = async () => {
    setRunning(true);
    setError("");
    setFailures([]);
    const skip: string[] = [];
    const failed: { name: string; error: string }[] = [];
    let moved = 0;
    try {
      for (;;) {
        setProgress(`Transfert en cours… ${moved} fichier${moved > 1 ? "s" : ""} transféré${moved > 1 ? "s" : ""}. Garde cette page ouverte.`);
        const res = await authFetch("/api/dataroom/storage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skip }),
        });
        const j = await readJson<{ moved: string[]; failed: { id: string; name: string; error: string }[]; remaining: number }>(res);
        if (!res.ok) throw new Error(j.error ?? `Erreur ${res.status}`);
        moved += j.moved.length;
        for (const f of j.failed) {
          skip.push(f.id);
          failed.push({ name: f.name, error: f.error });
        }
        if (j.remaining === 0) break;
        if (!j.moved.length && !j.failed.length) throw new Error("Le transfert n'avance plus. Réessaie dans un instant.");
      }
      setProgress(`Terminé : ${moved} fichier${moved > 1 ? "s" : ""} transféré${moved > 1 ? "s" : ""} vers o2switch.`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : String(e)} — ${moved} fichier(s) déjà transféré(s). Relance le transfert : il reprend où il s'est arrêté.`);
      setProgress("");
    } finally {
      setFailures(failed);
      setRunning(false);
      void load();
    }
  };

  if (!isAdmin) return null;

  const remoteOk = status?.remote?.ok === true;
  return (
    <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
      <h2 className="text-foreground mb-1 flex items-center gap-2 text-base font-bold">
        <HardDrive className="h-4 w-4 text-gray-400" aria-hidden="true" />
        Stockage des fichiers de la Data Room
      </h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Firebase est limité à 1 Go gratuit ; les fichiers peuvent être rangés sur l&apos;hébergement o2switch.
        Rien ne change pour l&apos;équipe ni pour les invités.
      </p>

      {!status && !error && <p className="text-muted-foreground text-sm">Chargement…</p>}

      {status && (
        <div className="grid grid-cols-2 gap-2">
          <div className="border-border bg-muted/40 rounded-lg border px-3 py-2">
            <p className="text-foreground text-lg font-bold tabular-nums">{formatSize(status.firebase.bytes)}</p>
            <p className="text-muted-foreground text-[10px] font-semibold uppercase">
              Sur Firebase · {status.firebase.files} fichier{status.firebase.files > 1 ? "s" : ""}
            </p>
          </div>
          <div className="border-border bg-muted/40 rounded-lg border px-3 py-2">
            <p className="text-foreground text-lg font-bold tabular-nums">{formatSize(status.o2switch.bytes)}</p>
            <p className="text-muted-foreground text-[10px] font-semibold uppercase">
              Sur o2switch · {status.o2switch.files} fichier{status.o2switch.files > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      {status && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {!status.configured ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
              o2switch non configuré (FILES_URL et FILES_SECRET dans Vercel)
            </span>
          ) : remoteOk ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              o2switch connecté
              {status.remote?.ok && status.remote.free != null ? ` · ${freeSpace(status.remote.free)} libres` : ""}
            </span>
          ) : (
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">
              o2switch ne répond pas : {status.remote && !status.remote.ok ? status.remote.error : "erreur inconnue"}
            </span>
          )}
          {remoteOk && status.firebase.files > 0 && (
            <button
              type="button"
              onClick={() => void transfer()}
              disabled={running}
              className="bg-primary text-primary-foreground ml-auto rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {running ? "Transfert…" : `Transférer ${status.firebase.files} fichier${status.firebase.files > 1 ? "s" : ""} vers o2switch`}
            </button>
          )}
        </div>
      )}

      {progress && <p className="text-foreground mt-3 text-sm">{progress}</p>}
      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
      {failures.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-semibold">Fichiers restés sur Firebase (toujours accessibles) :</p>
          <ul className="mt-1 list-disc pl-5">
            {failures.map((f) => (
              <li key={f.name + f.error}>
                {f.name} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
