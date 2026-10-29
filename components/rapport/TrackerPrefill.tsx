"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  TASK_CATEGORIES,
  authFetch,
  getMyTrackerDay,
  latestLog,
  todayLog,
  type RapportTask,
  type useRapport,
} from "@/lib/rapport";

type Rapport = ReturnType<typeof useRapport>;

interface Row {
  key: string;
  checked: boolean;
  hours: number;
  reason: string;
  task?: RapportTask;
  newName?: string;
  newCategory?: string;
}

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 rounded-lg border px-2 py-1 text-sm focus:outline-none";

export function TrackerPrefillButton({ rapport }: { rapport: Rapport }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [activeMin, setActiveMin] = useState(0);

  const { data, user } = rapport;

  const start = async () => {
    if (!user) return;
    setOpen(true);
    setLoading(true);
    setMessage("");
    setRows([]);
    try {
      const activity = await getMyTrackerDay(user.uid);
      if (!activity) {
        setMessage("Le tracker n'a encore rien envoyé aujourd'hui. Lance-le sur ton ordinateur, puis réessaie.");
        return;
      }
      const mine = data.tasks.filter((t) => !t.archived && t.ownerId === user.uid);
      const res = await authFetch("/api/ai/timesheet-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity,
          tasks: mine.map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description })),
          categories: TASK_CATEGORIES,
        }),
      });
      const out = (await res.json()) as {
        suggestions?: { taskId: string; hours: number; reason: string }[];
        newTasks?: { name: string; category: string; hours: number; reason: string }[];
        activeMinutes?: number;
        note?: string;
        error?: string;
      };
      if (!res.ok) {
        setMessage(out.error ?? "Suggestion impossible.");
        return;
      }
      setActiveMin(out.activeMinutes ?? 0);
      const next: Row[] = [
        ...(out.suggestions ?? []).flatMap((s) => {
          const task = mine.find((t) => t.id === s.taskId);
          return task ? [{ key: s.taskId, checked: true, hours: s.hours, reason: s.reason, task }] : [];
        }),
        ...(out.newTasks ?? []).map((n, i) => ({
          key: `new-${i}`,
          checked: true,
          hours: n.hours,
          reason: n.reason,
          newName: n.name,
          newCategory: n.category,
        })),
      ];
      setRows(next);
      if (!next.length) setMessage(out.note ?? "Rien à proposer : l'activité du jour ne correspond à aucune tâche.");
    } catch {
      setMessage("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  };

  const patch = (key: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const validate = async () => {
    if (!user) return;
    setSaving(true);
    try {
      for (const r of rows.filter((x) => x.checked && x.hours > 0)) {
        if (r.task) {
          const ll = latestLog(data.logs, r.task.id);
          const tl = todayLog(data.logs, r.task.id);
          await rapport.saveLog(r.task, {
            timeSpent: r.hours,
            progress: tl?.progress ?? ll?.progress ?? 0,
            status: tl?.status ?? ll?.status ?? "En cours",
            validationStatus: tl?.validationStatus ?? "À valider",
          });
        } else if (r.newName?.trim()) {
          await rapport.saveTask(
            null,
            {
              name: r.newName.trim(),
              category: r.newCategory || "Autre",
              description: r.reason,
              priority: "Normale",
              validator: "",
              sharepointLink: "",
              blocking: "",
            },
            { ownerId: user.uid, firstLog: { timeSpent: r.hours, progress: 0, status: "En cours" } },
          );
        }
      }
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const total = rows.filter((r) => r.checked).reduce((s, r) => s + r.hours, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
      >
        <Sparkles className="h-4 w-4 text-violet-600" aria-hidden="true" />
        Préremplir avec le tracker
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-card flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-border flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-foreground text-lg font-bold">Pointage proposé</h2>
                <p className="text-muted-foreground text-xs">
                  D&apos;après ton tracker{activeMin ? ` (${Math.floor(activeMin / 60)}h${String(activeMin % 60).padStart(2, "0")} d'activité)` : ""}.
                  Ajuste puis valide : rien n&apos;est enregistré avant.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="hover:bg-muted rounded p-1" aria-label="Fermer">
                <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
              {loading ? (
                <p className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Analyse de ta journée…
                </p>
              ) : message ? (
                <p className="text-muted-foreground py-10 text-center text-sm">{message}</p>
              ) : (
                rows.map((r) => {
                  const already = r.task ? todayLog(data.logs, r.task.id) : undefined;
                  return (
                    <div key={r.key} className="border-border flex items-start gap-3 rounded-lg border p-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={r.checked}
                        onChange={(e) => patch(r.key, { checked: e.target.checked })}
                        aria-label="Inclure"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        {r.task ? (
                          <p className="text-foreground text-sm font-semibold">{r.task.name}</p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 uppercase dark:bg-emerald-950/40 dark:text-emerald-300">
                              Nouvelle tâche
                            </span>
                            <input
                              className={`${inputClass} min-w-0 flex-1`}
                              value={r.newName}
                              onChange={(e) => patch(r.key, { newName: e.target.value })}
                            />
                            <select
                              className={inputClass}
                              value={r.newCategory}
                              onChange={(e) => patch(r.key, { newCategory: e.target.value })}
                            >
                              {TASK_CATEGORIES.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <p className="text-muted-foreground text-xs">{r.reason}</p>
                        {already && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Déjà pointé {already.timeSpent}h aujourd&apos;hui : sera remplacé.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          className={`${inputClass} w-16 text-center font-bold`}
                          value={r.hours}
                          onChange={(e) => patch(r.key, { hours: parseFloat(e.target.value) || 0 })}
                          aria-label="Heures"
                        />
                        <span className="text-muted-foreground text-xs">h</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {!loading && rows.length > 0 && (
              <div className="border-border flex items-center justify-between border-t px-6 py-4">
                <span className="text-muted-foreground text-sm">
                  Total : <strong className="text-foreground">{total}h</strong>
                </span>
                <button
                  type="button"
                  disabled={saving || total === 0}
                  onClick={() => void validate()}
                  className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Valider le pointage"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
