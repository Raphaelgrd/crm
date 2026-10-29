"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import {
  QUADRANTS,
  compareTodos,
  dayKey,
  dueBucket,
  quadrantOf,
  type Quadrant,
  type Todo,
  type TodoStatus,
} from "@/lib/todos";
import { Avatar, type Person } from "@/components/todos/TodoUI";

const TONES: Record<string, { head: string; body: string; dot: string }> = {
  rose: { head: "text-rose-700 dark:text-rose-300", body: "bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/60", dot: "bg-rose-500" },
  blue: { head: "text-blue-700 dark:text-blue-300", body: "bg-blue-50/70 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/60", dot: "bg-blue-500" },
  amber: { head: "text-amber-700 dark:text-amber-300", body: "bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/60", dot: "bg-amber-500" },
  slate: { head: "text-slate-600 dark:text-slate-300", body: "bg-slate-50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-800", dot: "bg-slate-400" },
};

// ── Ma journée ─────────────────────────────────────────────────

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-emerald-500 transition-all duration-500"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="text-foreground absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}

function Section({ title, count, tone, children, collapsible = false }: {
  title: string;
  count: number;
  tone?: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  if (!count) return null;
  return (
    <section className="space-y-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left">
        {open ? <ChevronDown className="text-muted-foreground h-4 w-4" aria-hidden="true" /> : <ChevronRight className="text-muted-foreground h-4 w-4" aria-hidden="true" />}
        <h2 className={`text-sm font-bold ${tone ?? "text-foreground"}`}>{title}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </section>
  );
}

export function DayView({
  todos,
  allMine,
  row,
  onPin,
  onToggle,
  onOpen,
}: {
  todos: Todo[];
  allMine: Todo[];
  row: (t: Todo) => React.ReactNode;
  onPin: (t: Todo) => void;
  onToggle: (t: Todo) => void;
  onOpen: (id: string) => void;
}) {
  const today = dayKey(0);
  const open = todos.filter((t) => t.status !== "done");
  const focus = open.filter((t) => t.focus).slice(0, 3);
  const overdue = open.filter((t) => !t.focus && dueBucket(t.due) === "overdue");
  const todayList = open.filter((t) => !t.focus && t.due === today);
  const doing = open.filter((t) => !t.focus && t.status === "doing" && t.due !== today && dueBucket(t.due) !== "overdue");
  const soon = open.filter((t) => !t.focus && t.status !== "doing" && ["tomorrow", "week"].includes(dueBucket(t.due)));
  const doneToday = allMine.filter((t) => t.status === "done" && t.doneAt.slice(0, 10) === today);
  const suggestions = open
    .filter((t) => !t.focus && (t.priority <= 2 || ["overdue", "today"].includes(dueBucket(t.due))))
    .slice(0, 3 - focus.length);
  const dayTotal = doneToday.length + focus.length + overdue.length + todayList.length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        {/* Top 3 */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden="true" />
            <h2 className="text-foreground text-sm font-bold">Top 3 du jour</h2>
            <span className="text-muted-foreground hidden text-xs sm:inline">Les 3 tâches qui feront avancer ta journée</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {focus.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t.id)}
                className="border-border bg-card group relative flex min-h-28 flex-col justify-between rounded-xl border-2 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderTopColor: ["#f59e0b", "#fbbf24", "#fcd34d"][i] }}
              >
                <span className="text-muted-foreground text-[11px] font-bold tabular-nums">#{i + 1}</span>
                <p className="text-foreground mt-1 line-clamp-3 text-sm font-semibold leading-snug">{t.title}</p>
                <span className="mt-3 flex items-center justify-between">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(t);
                    }}
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    ✓ Terminer
                  </span>
                  <span className="text-muted-foreground text-[11px]">{t.due && dueBucket(t.due) === "overdue" ? "En retard" : ""}</span>
                </span>
              </button>
            ))}
            {Array.from({ length: 3 - focus.length }, (_, i) => {
              const s = suggestions[i];
              return (
                <div key={`slot-${i}`} className="border-border text-muted-foreground flex min-h-28 flex-col justify-center rounded-xl border-2 border-dashed p-4 text-center text-xs">
                  {s ? (
                    <>
                      <p className="text-foreground mb-2 line-clamp-2 text-sm font-medium">{s.title}</p>
                      <button type="button" onClick={() => onPin(s)} className="mx-auto inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">
                        <Star className="h-3 w-3" aria-hidden="true" /> Épingler
                      </button>
                    </>
                  ) : (
                    <p>Clique sur ★ à côté d&apos;une tâche pour l&apos;épingler ici</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <Section title="En retard" count={overdue.length} tone="text-rose-600">
          {overdue.map(row)}
        </Section>
        <Section title="Aujourd'hui" count={todayList.length}>
          {todayList.map(row)}
        </Section>
        <Section title="En cours" count={doing.length}>
          {doing.map(row)}
        </Section>
        <Section title="Cette semaine" count={soon.length} collapsible>
          {soon.map(row)}
        </Section>
        <Section title="Fait aujourd'hui" count={doneToday.length} tone="text-emerald-600" collapsible>
          {doneToday.map(row)}
        </Section>
        {!open.length && !doneToday.length && (
          <div className="border-border rounded-xl border border-dashed py-14 text-center">
            <p className="text-foreground text-sm font-semibold">Rien de prévu pour l&apos;instant</p>
            <p className="text-muted-foreground mt-1 text-sm">Ajoute ta première tâche ci-dessus (raccourci : touche N).</p>
          </div>
        )}
      </div>

      <aside className="order-first space-y-4 lg:order-none">
        <div className="border-border bg-card flex items-center gap-4 rounded-xl border p-4">
          <ProgressRing done={doneToday.length} total={Math.max(dayTotal, doneToday.length)} />
          <div>
            <p className="text-foreground text-sm font-bold">Ta journée</p>
            <p className="text-muted-foreground text-xs">
              {doneToday.length === 0 ? "Commence par ta tâche #1." : dayTotal > doneToday.length ? "Continue, tu avances bien." : "Journée bouclée 🎉"}
            </p>
          </div>
        </div>
        <div className="border-border bg-card space-y-2 rounded-xl border p-4">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Répartition</p>
          {QUADRANTS.map((q) => {
            const n = open.filter((t) => quadrantOf(t) === q.id).length;
            return (
              <div key={q.id} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${TONES[q.tone].dot}`} />
                <span className="text-foreground flex-1">{q.title}</span>
                <span className="text-muted-foreground tabular-nums">{n}</span>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

export function PersonDay({ person, todos, row }: { person: Person; todos: Todo[]; row: (t: Todo) => React.ReactNode }) {
  const today = dayKey(0);
  const open = todos.filter((t) => t.status !== "done").sort(compareTodos);
  const focus = open.filter((t) => t.focus);
  const urgent = open.filter((t) => !t.focus && (dueBucket(t.due) === "overdue" || t.due === today || t.status === "doing"));
  const done = todos.filter((t) => t.status === "done" && t.doneAt.slice(0, 10) === today).length;
  const overdue = open.filter((t) => dueBucket(t.due) === "overdue").length;
  return (
    <div className="border-border bg-card flex flex-col rounded-xl border">
      <div className="border-border flex items-center gap-3 border-b p-4">
        <Avatar person={person} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-bold">{person.name}</p>
          <p className="text-muted-foreground text-xs">
            {open.length} à faire · {done} faite{done > 1 ? "s" : ""} aujourd&apos;hui
            {overdue > 0 && <span className="font-semibold text-rose-600"> · {overdue} en retard</span>}
          </p>
        </div>
      </div>
      <div className="space-y-1.5 p-3">
        {focus.length > 0 && <p className="px-1 text-[11px] font-bold text-amber-600 uppercase">★ Top 3</p>}
        {focus.map(row)}
        {urgent.length > 0 && <p className="text-muted-foreground px-1 pt-2 text-[11px] font-bold uppercase">Aujourd&apos;hui et en retard</p>}
        {urgent.slice(0, 8).map(row)}
        {!focus.length && !urgent.length && <p className="text-muted-foreground py-6 text-center text-xs">Rien d&apos;urgent</p>}
      </div>
    </div>
  );
}

// ── Matrice d'Eisenhower ───────────────────────────────────────

function DropZone({ onDrop, className, children }: { onDrop: (id: string) => void; className: string; children: React.ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/todo");
        if (id) onDrop(id);
      }}
      className={`${className} ${over ? "ring-primary/40 ring-4" : ""}`}
    >
      {children}
    </div>
  );
}

export function MatrixView({ todos, row, onDrop }: { todos: Todo[]; row: (t: Todo) => React.ReactNode; onDrop: (id: string, q: Quadrant) => void }) {
  return (
    <div>
      <div className="text-muted-foreground mb-2 hidden grid-cols-2 gap-4 px-1 text-[11px] font-semibold tracking-wide uppercase md:grid">
        <span>Urgent</span>
        <span>Pas urgent</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(["do", "plan", "quick", "later"] as Quadrant[]).map((qid) => {
            const q = QUADRANTS.find((x) => x.id === qid)!;
            const tone = TONES[q.tone];
            const list = todos.filter((t) => quadrantOf(t) === qid);
            return (
              <DropZone key={qid} onDrop={(id) => onDrop(id, qid)} className={`flex min-h-56 flex-col rounded-2xl border p-4 transition-shadow ${tone.body}`}>
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    <h2 className={`text-sm font-bold ${tone.head}`}>{q.title}</h2>
                    <p className="text-muted-foreground text-[11px]">{q.hint}</p>
                  </div>
                  <span className={`text-2xl font-bold tabular-nums ${tone.head}`}>{list.length}</span>
                </div>
                <div className="space-y-1.5">{list.map(row)}</div>
                {!list.length && <p className="text-muted-foreground m-auto text-xs">Glisse une tâche ici</p>}
              </DropZone>
            );
          })}
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        Important = priorité P1 ou P2. Urgent = échéance dépassée, aujourd&apos;hui ou demain. Glisser une tâche ajuste sa priorité et son échéance.
      </p>
    </div>
  );
}

// ── Tableau ────────────────────────────────────────────────────

const COLUMNS: { id: TodoStatus; title: string; accent: string }[] = [
  { id: "todo", title: "À faire", accent: "bg-slate-400" },
  { id: "doing", title: "En cours", accent: "bg-sky-500" },
  { id: "done", title: "Fait", accent: "bg-emerald-500" },
];

export function BoardView({ todos, row, onDrop }: { todos: Todo[]; row: (t: Todo) => React.ReactNode; onDrop: (id: string, s: TodoStatus) => void }) {
  const weekAgo = dayKey(-7);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((c) => {
        const list = todos.filter((t) => t.status === c.id && (c.id !== "done" || t.doneAt.slice(0, 10) >= weekAgo));
        return (
          <DropZone key={c.id} onDrop={(id) => onDrop(id, c.id)} className="bg-muted/50 flex min-h-72 flex-col rounded-2xl p-3 transition-shadow">
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className={`h-2.5 w-2.5 rounded-full ${c.accent}`} />
              <h2 className="text-foreground text-sm font-bold">{c.title}</h2>
              <span className="text-muted-foreground text-xs tabular-nums">{list.length}</span>
              {c.id === "done" && <span className="text-muted-foreground ml-auto text-[11px]">7 derniers jours</span>}
            </div>
            <div className="space-y-1.5">{list.map(row)}</div>
          </DropZone>
        );
      })}
    </div>
  );
}

// ── Liste par échéance ─────────────────────────────────────────

export function ListView({ todos, row }: { todos: Todo[]; row: (t: Todo) => React.ReactNode }) {
  const open = todos.filter((t) => t.status !== "done");
  const groups: { title: string; tone?: string; items: Todo[] }[] = [
    { title: "En retard", tone: "text-rose-600", items: open.filter((t) => dueBucket(t.due) === "overdue") },
    { title: "Aujourd'hui", items: open.filter((t) => dueBucket(t.due) === "today") },
    { title: "Demain", items: open.filter((t) => dueBucket(t.due) === "tomorrow") },
    { title: "Cette semaine", items: open.filter((t) => dueBucket(t.due) === "week") },
    { title: "Plus tard", items: open.filter((t) => dueBucket(t.due) === "later") },
    { title: "Sans échéance", items: open.filter((t) => dueBucket(t.due) === "none") },
  ];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Section key={g.title} title={g.title} count={g.items.length} tone={g.tone}>
          {g.items.map(row)}
        </Section>
      ))}
      {!open.length && <p className="text-muted-foreground py-16 text-center text-sm">Aucune tâche ouverte.</p>}
    </div>
  );
}
