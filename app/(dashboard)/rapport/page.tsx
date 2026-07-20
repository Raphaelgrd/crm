"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  History,
  Link2,
  LogOut,
  Plus,
  Share2,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import {
  PRIORITIES,
  RapportLog,
  RapportTask,
  TASK_CATEGORIES,
  TASK_STATUSES,
  VALIDATION_STATUSES,
  canSeeTask,
  fmtDateFr,
  frAuthError,
  initials,
  isoWeek,
  latestLog,
  todayKey,
  todayLog,
  useRapport,
} from "@/lib/rapport";

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";
const labelClass = "text-foreground mb-1 block text-xs font-medium";

type Tab = "today" | "tasks" | "journal" | "export" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "tasks", label: "Tâches" },
  { id: "journal", label: "Journal" },
  { id: "export", label: "Exporter" },
  { id: "settings", label: "Paramètres" },
];

function statusBadgeClass(s: string) {
  switch (s) {
    case "Terminé":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "En attente":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Bloqué":
      return "bg-red-50 text-red-600 border-red-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

function SegBar({ progress, segments = 20 }: { progress: number; segments?: number }) {
  return (
    <div className="flex h-1.5 gap-0.5">
      {Array.from({ length: segments }, (_, i) => {
        const on = ((i + 1) * 100) / segments <= progress;
        return (
          <div
            key={i}
            className={
              "flex-1 rounded-sm " +
              (on ? (progress >= 100 ? "bg-emerald-500" : "bg-primary") : "bg-gray-200")
            }
          />
        );
      })}
    </div>
  );
}

export default function RapportPage() {
  const rapport = useRapport();
  const {
    user,
    authLoading,
    dataLoading,
    data,
    isAdmin,
    ownerName,
    signOutUser,
  } = rapport;

  const [tab, setTab] = useState<Tab>("today");
  const [modalTaskId, setModalTaskId] = useState<string | null | "new">(null);

  const todayHours = data.logs
    .filter((l) => l.date === todayKey())
    .reduce((s, l) => s + (+l.timeSpent || 0), 0);

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">
              Rapport d&apos;activité
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Pointage des heures et suivi des tâches de l&apos;équipe
            </p>
          </div>
          {user && (
            <div className="flex shrink-0 items-center gap-3">
              {todayHours > 0 && (
                <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-bold">
                  {todayHours}h aujourd&apos;hui
                </span>
              )}
              <div
                className="bg-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                title={ownerName}
              >
                {initials(ownerName)}
              </div>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2 transition-colors"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        {user && (
          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  "rounded-lg px-4 py-2 text-sm font-semibold transition-colors " +
                  (tab === t.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground border")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {authLoading || (user && dataLoading) ? (
          <p className="text-muted-foreground py-16 text-center text-sm">Connexion en cours…</p>
        ) : !user ? (
          <AuthCard rapport={rapport} />
        ) : (
          <div className="mx-auto max-w-3xl">
            {tab === "today" && (
              <TodayView rapport={rapport} onNewTask={() => setModalTaskId("new")} onEdit={setModalTaskId} />
            )}
            {tab === "tasks" && (
              <TasksView rapport={rapport} onNewTask={() => setModalTaskId("new")} onEdit={setModalTaskId} />
            )}
            {tab === "journal" && <JournalView rapport={rapport} />}
            {tab === "export" && <ExportView rapport={rapport} />}
            {tab === "settings" && <SettingsView rapport={rapport} />}
          </div>
        )}
      </div>

      {modalTaskId !== null && user && (
        <TaskModal
          rapport={rapport}
          taskId={modalTaskId === "new" ? null : modalTaskId}
          onClose={() => setModalTaskId(null)}
        />
      )}
    </div>
  );
}

// ── Connexion / inscription ─────────────────────────────────

function AuthCard({ rapport }: { rapport: ReturnType<typeof useRapport> }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password || (mode === "signup" && !name.trim())) {
      setError("Remplissez tous les champs.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") await rapport.signUp(name.trim(), email.trim(), password);
      else await rapport.signIn(email.trim(), password);
    } catch (err) {
      setError(frAuthError((err as { code?: string }).code ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="border-border bg-card rounded-2xl border p-8 shadow-(--shadow-card)">
        <div className="bg-primary mb-4 flex h-11 w-11 items-center justify-center rounded-xl">
          <Clock className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <h2 className="text-foreground text-lg font-bold">
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h2>
        <p className="text-muted-foreground mt-1 mb-5 text-sm">
          Accédez à votre rapport d&apos;activité Netforce.
        </p>
        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className={labelClass}>Prénom</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex : Raphael"
                autoComplete="given-name"
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@netforce.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className={labelClass}>Mot de passe</label>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Se connecter" : "S'inscrire"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "signup" : "login"));
            setError("");
          }}
          className="text-muted-foreground hover:text-foreground mt-3 w-full text-center text-xs font-medium transition-colors"
        >
          {mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

// ── Carte de tâche + pointage inline ────────────────────────

function TaskCard({
  rapport,
  task,
  mode,
  onEdit,
}: {
  rapport: ReturnType<typeof useRapport>;
  task: RapportTask;
  mode: "today" | "tasks";
  onEdit: (id: string) => void;
}) {
  const { data, user, isAdmin } = rapport;
  const ll = latestLog(data.logs, task.id);
  const tl = todayLog(data.logs, task.id);
  const progress = ll?.progress ?? 0;
  const status = ll?.status ?? "En cours";
  const isOwn = task.ownerId === user?.uid;
  const canEdit = isOwn || isAdmin;

  const [formOpen, setFormOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [time, setTime] = useState(String(tl?.timeSpent ?? 1));
  const [prog, setProg] = useState(tl?.progress ?? progress);
  const [stat, setStat] = useState(tl?.status ?? status);
  const [valid, setValid] = useState(tl?.validationStatus ?? "À valider");
  const [confirmDeleteLog, setConfirmDeleteLog] = useState(false);

  const taskLogs = data.logs
    .filter((l) => l.taskId === task.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalH = taskLogs.reduce((s, l) => s + (+l.timeSpent || 0), 0);

  const ownerLabel = data.users[task.ownerId]?.name || "?";

  const priorityBorder =
    task.priority === "Haute"
      ? "border-l-red-400"
      : task.priority === "Basse"
        ? "border-l-gray-200"
        : "border-l-gray-300";

  const saveLog = async () => {
    await rapport.saveLog(task, {
      timeSpent: parseFloat(time) || 0,
      progress: prog,
      status: stat,
      validationStatus: valid,
    });
    setFormOpen(false);
  };

  return (
    <div
      className={`border-border bg-card overflow-hidden rounded-xl border border-l-4 shadow-(--shadow-card) ${priorityBorder} ${task.archived ? "opacity-60" : ""}`}
    >
      <div className="p-4">
        <p className="text-foreground text-sm font-bold">{task.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase">
            {task.category || "—"}
          </span>
          <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadgeClass(status)}`}
          >
            {status}
          </span>
          {task.priority === "Haute" && (
            <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 uppercase">
              Haute
            </span>
          )}
          {task.visibility === "admin" && (
            <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase">
              🔒 Admin
            </span>
          )}
          {!isOwn && (
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 uppercase">
              👤 {ownerLabel}
            </span>
          )}
          {task.validator && (
            <span className="text-muted-foreground text-[11px]">→ {task.validator}</span>
          )}
          {task.sharepointLink && (
            <a
              href={task.sharepointLink}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
              title="Lien SharePoint"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-muted-foreground text-[10px] font-semibold uppercase">
              Avancement
            </span>
            <span className="text-primary text-xs font-bold">{progress}%</span>
          </div>
          <SegBar progress={progress} />
        </div>
      </div>

      {/* Pied de carte */}
      {mode === "today" ? (
        tl ? (
          <div className="border-border bg-muted/40 flex items-center gap-3 border-t px-4 py-2.5">
            <span className="text-primary text-lg font-bold">{tl.timeSpent}h</span>
            <span className="text-muted-foreground text-xs">pointé aujourd&apos;hui</span>
            <button
              type="button"
              onClick={() => setFormOpen((o) => !o)}
              className="border-border bg-card text-foreground hover:bg-muted ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              Modifier
            </button>
          </div>
        ) : (
          <div className="border-border flex items-center justify-between border-t px-4 py-2.5">
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
              ⏰ Non pointé
            </span>
            <button
              type="button"
              onClick={() => setFormOpen((o) => !o)}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
            >
              Pointer →
            </button>
          </div>
        )
      ) : (
        <div className="border-border flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
          <span className="text-muted-foreground mr-auto text-[11px]">
            Dernière activité : {ll ? fmtDateFr(ll.date) : "Jamais"} · {totalH}h total
          </span>
          <button
            type="button"
            onClick={() => setHistOpen((o) => !o)}
            className="text-muted-foreground hover:bg-muted rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
            title="Historique"
          >
            <History className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {taskLogs.length}
          </button>
          {task.archived ? (
            canEdit && (
              <button
                type="button"
                onClick={() => void rapport.setArchived(task.id, false)}
                className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors"
              >
                <ArchiveRestore className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Restaurer
              </button>
            )
          ) : (
            <>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(task.id)}
                  className="text-muted-foreground hover:bg-muted rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                >
                  <SquarePen className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  Modifier
                </button>
              )}
              {isOwn && (
                <button
                  type="button"
                  onClick={() => setFormOpen((o) => !o)}
                  className="bg-primary text-primary-foreground rounded-lg px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-90"
                >
                  Pointer
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShareOpen((o) => !o)}
                  className="text-muted-foreground hover:bg-muted rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                  title="Partager"
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void rapport.setArchived(task.id, true)}
                  className="text-muted-foreground hover:bg-muted rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                  title="Archiver"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Historique */}
      {histOpen && (
        <div className="border-border border-t px-4 py-3">
          {taskLogs.length === 0 ? (
            <p className="text-muted-foreground text-xs">Aucun pointage enregistré</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted-foreground text-[10px] uppercase">
                  <th className="pb-1 font-semibold">Date</th>
                  <th className="pb-1 font-semibold">Heures</th>
                  <th className="pb-1 font-semibold">Avt.</th>
                  <th className="pb-1 font-semibold">Statut</th>
                  <th className="pb-1 font-semibold">Validation</th>
                </tr>
              </thead>
              <tbody>
                {taskLogs.map((l) => (
                  <tr key={l.id} className="border-border border-t">
                    <td className="py-1.5">{fmtDateFr(l.date)}</td>
                    <td className="text-primary py-1.5 font-bold">{l.timeSpent}h</td>
                    <td className="py-1.5">{l.progress}%</td>
                    <td className="py-1.5">{l.status}</td>
                    <td className="text-muted-foreground py-1.5">{l.validationStatus || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Partage (admin) */}
      {shareOpen && (
        <div className="border-border border-t px-4 py-3">
          <p className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase">
            Partager avec
          </p>
          {Object.entries(data.users)
            .filter(([uid]) => uid !== task.ownerId)
            .map(([uid, u]) => {
              const uname = u.name || u.email?.split("@")[0] || "?";
              const isShared = (task.sharedWith ?? []).includes(uid);
              return (
                <div key={uid} className="border-border flex items-center gap-2 border-b py-1.5 last:border-b-0">
                  <span className="bg-primary flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white">
                    {initials(uname)}
                  </span>
                  <span className="text-foreground flex-1 text-sm">{uname}</span>
                  <button
                    type="button"
                    onClick={() => void rapport.shareTask(task.id, uid, !isShared)}
                    className={
                      "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors " +
                      (isShared
                        ? "border-border bg-card text-foreground hover:bg-muted border"
                        : "bg-primary text-primary-foreground hover:opacity-90")
                    }
                  >
                    {isShared ? "Retirer" : "Partager"}
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* Formulaire de pointage */}
      {formOpen && (
        <div className="border-border bg-muted/40 border-t px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Temps passé (h)</label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTime((t) => String(Math.max(0, (parseFloat(t) || 0) - 0.5)))}
                  className="border-border bg-card h-8 w-8 rounded-lg border text-base font-bold"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="border-border bg-card w-20 rounded-lg border px-2 py-1.5 text-center text-sm font-bold"
                />
                <button
                  type="button"
                  onClick={() => setTime((t) => String(Math.min(24, (parseFloat(t) || 0) + 0.5)))}
                  className="border-border bg-card h-8 w-8 rounded-lg border text-base font-bold"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Avancement global : {prog}%</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={prog}
                onChange={(e) => setProg(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </div>
            <div>
              <label className={labelClass}>Statut</label>
              <select className={inputClass} value={stat} onChange={(e) => setStat(e.target.value)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Validation</label>
              <select className={inputClass} value={valid} onChange={(e) => setValid(e.target.value)}>
                {VALIDATION_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveLog()}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-muted-foreground hover:bg-muted rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              Annuler
            </button>
            {tl &&
              (confirmDeleteLog ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteLog(false);
                    setFormOpen(false);
                    void rapport.deleteTodayLog(task.id);
                  }}
                  className="ml-auto rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                >
                  Confirmer ?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteLog(true)}
                  className="text-muted-foreground ml-auto rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aujourd'hui ─────────────────────────────────────────────

function TodayView({
  rapport,
  onNewTask,
  onEdit,
}: {
  rapport: ReturnType<typeof useRapport>;
  onNewTask: () => void;
  onEdit: (id: string) => void;
}) {
  const { data, user, isAdmin } = rapport;
  const active = data.tasks.filter(
    (t) => !t.archived && canSeeTask(t, user?.uid, isAdmin) && t.ownerId === user?.uid,
  );
  const totalH = data.logs
    .filter((l) => l.date === todayKey())
    .reduce((s, l) => s + (+l.timeSpent || 0), 0);
  const loggedN = active.filter((a) => !!todayLog(data.logs, a.id)).length;
  const pendingN = active.length - loggedN;

  const prio: Record<string, number> = { Haute: 0, Normale: 1, Basse: 2 };
  const sorted = [...active].sort((a, b) => {
    const aL = !!todayLog(data.logs, a.id);
    const bL = !!todayLog(data.logs, b.id);
    if (aL !== bL) return aL ? 1 : -1;
    return (prio[a.priority ?? "Normale"] ?? 1) - (prio[b.priority ?? "Normale"] ?? 1);
  });

  return (
    <div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="border-border bg-card rounded-xl border p-4">
          <p className="text-primary text-2xl font-bold">{totalH}h</p>
          <p className="text-muted-foreground text-[10px] font-semibold uppercase">Heures pointées</p>
        </div>
        <div className="border-border bg-card rounded-xl border p-4">
          <p className="text-2xl font-bold text-emerald-600">{loggedN}</p>
          <p className="text-muted-foreground text-[10px] font-semibold uppercase">Tâches pointées</p>
        </div>
        <div className="border-border bg-card rounded-xl border p-4">
          <p className={`text-2xl font-bold ${pendingN > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {pendingN}
          </p>
          <p className="text-muted-foreground text-[10px] font-semibold uppercase">En attente</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-foreground text-base font-bold">Tâches actives</h2>
          <p className="text-muted-foreground text-xs">
            {active.length} tâche{active.length !== 1 ? "s" : ""} active{active.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onNewTask}
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouvelle tâche
        </button>
      </div>

      {active.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed py-14 text-center">
          <p className="text-foreground text-sm font-semibold">Aucune tâche active</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Crée ta première tâche pour commencer à pointer ton activité.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((t) => (
            <TaskCard key={t.id} rapport={rapport} task={t} mode="today" onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tâches ──────────────────────────────────────────────────

function TasksView({
  rapport,
  onNewTask,
  onEdit,
}: {
  rapport: ReturnType<typeof useRapport>;
  onNewTask: () => void;
  onEdit: (id: string) => void;
}) {
  const { data, user, isAdmin } = rapport;
  const [filter, setFilter] = useState<"active" | "all" | "archived">("active");
  const visible = data.tasks.filter((t) => canSeeTask(t, user?.uid, isAdmin));
  const tasks =
    filter === "active"
      ? visible.filter((t) => !t.archived)
      : filter === "archived"
        ? visible.filter((t) => t.archived)
        : visible;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-foreground text-base font-bold">Tâches</h2>
        <button
          type="button"
          onClick={onNewTask}
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouvelle tâche
        </button>
      </div>
      <div className="mb-4 flex gap-2">
        {(
          [
            ["active", "Actives"],
            ["all", "Toutes"],
            ["archived", "Archivées"],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
              (filter === f
                ? "border-border bg-card text-foreground border shadow-sm"
                : "text-muted-foreground hover:bg-muted")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {tasks.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed py-14 text-center">
          <p className="text-muted-foreground text-sm">Aucune tâche.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskCard key={t.id} rapport={rapport} task={t} mode="tasks" onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Journal ─────────────────────────────────────────────────

function JournalView({ rapport }: { rapport: ReturnType<typeof useRapport> }) {
  const [date, setDate] = useState(todayKey());
  const [logs, setLogs] = useState<RapportLog[] | null>(null);

  const load = useCallback(
    (d: string) => {
      setLogs(null);
      void rapport.journalFor(d).then(setLogs);
    },
    [rapport],
  );

  useEffect(() => load(date), [date, load]);

  const shift = (delta: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split("T")[0]);
  };

  const label = new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const byOwner = useMemo(() => {
    const map = new Map<string, { name: string; logs: RapportLog[]; totalH: number }>();
    for (const log of logs ?? []) {
      const k = log.ownerId || "?";
      const entry = map.get(k) ?? { name: log.ownerName || "?", logs: [], totalH: 0 };
      entry.logs.push(log);
      entry.totalH += +log.timeSpent || 0;
      map.set(k, entry);
    }
    return [...map.values()].sort((a, b) => b.totalH - a.totalH);
  }, [logs]);

  const grandTotal = byOwner.reduce((s, e) => s + e.totalH, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="border-border bg-card hover:bg-muted rounded-lg border p-2 transition-colors"
          aria-label="Jour précédent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="text-foreground text-center text-base font-bold capitalize">{label}</p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="border-border bg-card hover:bg-muted rounded-lg border p-2 transition-colors"
          aria-label="Jour suivant"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {logs === null ? (
        <p className="text-muted-foreground py-10 text-center text-sm">Chargement…</p>
      ) : byOwner.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed py-14 text-center">
          <p className="text-foreground text-sm font-semibold">Aucune activité ce jour</p>
          <p className="text-muted-foreground mt-1 text-sm">Aucun pointage enregistré pour cette date.</p>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mb-4 text-center text-sm">
            {grandTotal}h pointées · {byOwner.length} personne{byOwner.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-3">
            {byOwner.map(({ name, logs: ownerLogs, totalH }) => (
              <div key={name} className="border-border bg-card overflow-hidden rounded-xl border shadow-(--shadow-card)">
                <div className="border-border bg-muted/50 flex items-center gap-3 border-b px-4 py-3">
                  <span className="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white">
                    {initials(name)}
                  </span>
                  <span className="text-foreground flex-1 text-sm font-bold">{name}</span>
                  <span className="text-primary text-base font-bold">{totalH}h</span>
                </div>
                {ownerLogs.map((log) => (
                  <div
                    key={log.id}
                    className="border-border grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-medium">{log.taskName || "—"}</p>
                      <p className="text-muted-foreground text-[10px]">{log.taskCategory || ""}</p>
                    </div>
                    <span className="text-muted-foreground text-xs">{log.progress}%</span>
                    <span className="text-primary text-sm font-bold">{log.timeSpent}h</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Export CSV ──────────────────────────────────────────────

function ExportView({ rapport }: { rapport: ReturnType<typeof useRapport> }) {
  const { data } = rapport;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const setRange = useCallback(
    (r: "week" | "lastweek" | "month" | "all") => {
      const now = new Date();
      let s: Date, e: Date;
      if (r === "week") {
        const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
        s = new Date(now);
        s.setDate(now.getDate() + diff);
        e = new Date(s);
        e.setDate(s.getDate() + 6);
      } else if (r === "lastweek") {
        const diff = now.getDay() === 0 ? -13 : -6 - now.getDay();
        s = new Date(now);
        s.setDate(now.getDate() + diff);
        e = new Date(s);
        e.setDate(s.getDate() + 6);
      } else if (r === "month") {
        s = new Date(now.getFullYear(), now.getMonth(), 1);
        e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else {
        if (!data.logs.length) {
          s = e = now;
        } else {
          const dates = data.logs.map((l) => l.date).sort();
          s = new Date(dates[0]);
          e = new Date(dates[dates.length - 1]);
        }
      }
      setStart(s.toISOString().split("T")[0]);
      setEnd(e.toISOString().split("T")[0]);
    },
    [data.logs],
  );

  useEffect(() => setRange("week"), [setRange]);

  const rows = useMemo(() => {
    if (!start || !end) return [];
    return data.logs
      .filter((l) => l.date >= start && l.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => ({ log, task: data.tasks.find((t) => t.id === log.taskId) }))
      .filter((r): r is { log: RapportLog; task: RapportTask } => !!r.task);
  }, [data.logs, data.tasks, start, end]);

  const downloadCSV = () => {
    if (!rows.length) return;
    const name = data.settings.name ?? "";
    const hdrs = [
      "Date", "Apprenti", "Catégorie", "Tâche / Livrable", "Description / Détail", "Statut",
      "Avancement %", "Temps passé (h)", "Emplacement (lien SharePoint)", "À valider par",
      "Statut validation", "Blocage / En attente de", "Priorité", "", "Semaine (auto)",
    ];
    const csvRows = rows.map(({ log, task }) =>
      [
        fmtDateFr(log.date), name, task.category, task.name, task.description || "", log.status,
        log.progress + "%", log.timeSpent, task.sharepointLink || "", task.validator || "",
        log.validationStatus || "", task.blocking || "", task.priority || "", "", isoWeek(log.date),
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = [
      "NETFORCE ; RAPPORT D'ACTIVITÉ JOURNALIER ; MARKETING & COMMUNICATION;;;;;;;;;;;;;;",
      "À remplir quotidiennement, une ligne par tâche ou livrable.;;;;;;;;;;;;;;",
      ";;;;;;;;;;;;;;",
      hdrs.join(";"),
      ...csvRows,
    ].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_${start}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <div className="border-border bg-card rounded-xl border p-5 shadow-(--shadow-card)">
      <h2 className="text-foreground mb-4 text-base font-bold">Exporter le rapport CSV</h2>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Du</label>
          <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Au</label>
          <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["week", "Cette semaine"],
            ["lastweek", "Semaine passée"],
            ["month", "Ce mois"],
            ["all", "Tout"],
          ] as const
        ).map(([r, label]) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {rows.length} entrée{rows.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={downloadCSV}
          disabled={!rows.length}
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Télécharger CSV
        </button>
      </div>
      <div className="border-border max-h-72 overflow-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted sticky top-0">
            <tr>
              {["Date", "Catégorie", "Tâche", "Statut", "Avt %", "Temps", "Validateur", "Semaine"].map((h) => (
                <th key={h} className="text-muted-foreground px-3 py-2 text-[10px] font-semibold uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-muted-foreground px-3 py-6 text-center">
                  Aucune entrée dans cette période
                </td>
              </tr>
            ) : (
              rows.map(({ log, task }) => (
                <tr key={log.id} className="border-border border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateFr(log.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{task.category}</td>
                  <td className="max-w-44 truncate px-3 py-2" title={task.name}>{task.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{log.status}</td>
                  <td className="px-3 py-2">{log.progress}%</td>
                  <td className="text-primary px-3 py-2 font-bold">{log.timeSpent}h</td>
                  <td className="px-3 py-2 whitespace-nowrap">{task.validator || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{isoWeek(log.date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Paramètres ──────────────────────────────────────────────

function SettingsView({ rapport }: { rapport: ReturnType<typeof useRapport> }) {
  const { data, user, isAdmin, ownerName } = rapport;
  const [name, setName] = useState(data.settings.name ?? "");
  const [validators, setValidators] = useState((data.settings.validators ?? []).join("\n"));
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-4">
      <div className="border-border bg-card rounded-xl border p-5 shadow-(--shadow-card)">
        <div className="mb-4 flex items-center gap-3">
          <span className="bg-primary flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white">
            {initials(name || ownerName)}
          </span>
          <div>
            <p className="text-foreground text-sm font-bold">{name || ownerName}</p>
            <p className="text-muted-foreground text-xs">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Prénom affiché dans les exports</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Validateurs (un par ligne)</label>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={validators}
              onChange={(e) => setValidators(e.target.value)}
              placeholder={"Laurent\nSébastien"}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void rapport
                .saveSettings(name.trim(), validators.split("\n").map((v) => v.trim()).filter(Boolean))
                .then(() => {
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                });
            }}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            {saved ? "✓ Sauvegardé" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {isAdmin && Object.keys(data.users).length > 0 && (
        <div className="border-border bg-card rounded-xl border p-5 shadow-(--shadow-card)">
          <p className="text-muted-foreground mb-3 text-xs font-bold uppercase">
            Administration · {Object.keys(data.users).length} utilisateur
            {Object.keys(data.users).length > 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {Object.entries(data.users).map(([uid, u]) => {
              const uname = u.name || u.email?.split("@")[0] || "?";
              const isSelf = uid === user?.uid;
              return (
                <div key={uid} className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2">
                  <span className="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white">
                    {initials(uname)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-semibold">
                      {uname}{" "}
                      {u.isAdmin && (
                        <span className="bg-primary/10 text-primary ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
                          Admin
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{u.email || "—"}</p>
                  </div>
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => void rapport.toggleAdmin(uid, !u.isAdmin)}
                      className="text-muted-foreground hover:bg-muted rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors"
                    >
                      {u.isAdmin ? "Retirer admin" : "Rendre admin"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modale tâche ────────────────────────────────────────────

function TaskModal({
  rapport,
  taskId,
  onClose,
}: {
  rapport: ReturnType<typeof useRapport>;
  taskId: string | null;
  onClose: () => void;
}) {
  const { data, user, isAdmin } = rapport;
  const existing = taskId ? data.tasks.find((t) => t.id === taskId) : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [priority, setPriority] = useState(existing?.priority ?? "Normale");
  const [validator, setValidator] = useState(existing?.validator ?? "");
  const [sharepointLink, setSharepointLink] = useState(existing?.sharepointLink ?? "");
  const [blocking, setBlocking] = useState(existing?.blocking ?? "");
  const [assignee, setAssignee] = useState(existing?.ownerId ?? user?.uid ?? "");
  const [visibility, setVisibility] = useState<"all" | "admin">(existing?.visibility ?? "all");
  const [time, setTime] = useState("1");
  const [prog, setProg] = useState(0);
  const [stat, setStat] = useState("En cours");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom est requis.");
      return;
    }
    if (!category) {
      setError("Choisis une catégorie.");
      return;
    }
    setSaving(true);
    try {
      const fields = {
        name: name.trim(),
        category,
        description: description.trim(),
        priority,
        validator,
        sharepointLink: sharepointLink.trim(),
        blocking: blocking.trim(),
        ...(isAdmin ? { visibility } : {}),
      };
      await rapport.saveTask(taskId, fields, {
        ownerId: isAdmin ? assignee : (user?.uid ?? ""),
        firstLog: taskId
          ? undefined
          : { timeSpent: parseFloat(time) || 0, progress: prog, status: stat },
      });
      onClose();
    } catch {
      setError("Erreur de sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">
            {taskId ? "Modifier la tâche" : "Nouvelle tâche"}
          </h2>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1" aria-label="Fermer">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={save} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className={labelClass}>Nom de la tâche / Livrable *</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Création du deck investisseur"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Catégorie *</label>
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Choisir…</option>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Priorité</label>
              <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Description / Détail</label>
            <textarea
              className={`${inputClass} min-h-14 resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>À valider par</label>
              <select className={inputClass} value={validator} onChange={(e) => setValidator(e.target.value)}>
                <option value="">Aucun</option>
                {(data.settings.validators ?? []).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Blocage / En attente de</label>
              <input
                className={inputClass}
                value={blocking}
                onChange={(e) => setBlocking(e.target.value)}
                placeholder="ex : Retour de Laurent"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Lien SharePoint / URL</label>
            <input
              type="url"
              className={inputClass}
              value={sharepointLink}
              onChange={(e) => setSharepointLink(e.target.value)}
              placeholder="https://…"
            />
          </div>

          {isAdmin && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Assigné à</label>
                <select className={inputClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value={user?.uid ?? ""}>Moi-même</option>
                  {Object.entries(data.users)
                    .filter(([uid]) => uid !== user?.uid)
                    .map(([uid, u]) => (
                      <option key={uid} value={uid}>
                        {u.name || u.email?.split("@")[0] || uid}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Visibilité</label>
                <select
                  className={inputClass}
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as "all" | "admin")}
                >
                  <option value="all">Tout le monde</option>
                  <option value="admin">Admins uniquement</option>
                </select>
              </div>
            </div>
          )}

          {!taskId && (
            <div className="border-border bg-muted/40 space-y-3 rounded-lg border p-4">
              <p className="text-muted-foreground text-[10px] font-bold uppercase">
                Pointage du jour — {fmtDateFr(todayKey())}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Temps passé (h)</label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    className={inputClass}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Avancement : {prog}%</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={prog}
                    onChange={(e) => setProg(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Statut</label>
                <select className={inputClass} value={stat} onChange={(e) => setStat(e.target.value)}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
