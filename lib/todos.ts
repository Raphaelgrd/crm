"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

// Tâches personnelles (collection "todos") : chaque tâche appartient à une personne (ownerId = uid du compte).

export type Priority = 1 | 2 | 3 | 4;
export type TodoStatus = "todo" | "doing" | "done";

export interface Todo {
  id: string;
  title: string;
  notes: string;
  ownerId: string;
  ownerName: string;
  priority: Priority;
  /** YYYY-MM-DD, "" = sans échéance. */
  due: string;
  status: TodoStatus;
  /** Épinglée dans le « Top 3 » du jour. */
  focus: boolean;
  tags: string[];
  contactId: string;
  contactName: string;
  createdBy: string;
  doneAt: string;
  createdAt: string;
  updatedAt: string;
}

export type TodoInput = Omit<Todo, "id" | "createdAt" | "updatedAt">;

const store = createCollectionStore<Todo>("todos");

const makeId = () => `td_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setTodos(store.get());
        setLoading(false);
      }),
    [],
  );

  const addTodo = useCallback(async (input: TodoInput) => {
    const now = new Date().toISOString();
    await store.set({ ...input, id: makeId(), createdAt: now, updatedAt: now });
  }, []);

  const updateTodo = useCallback(async (id: string, patch: Partial<TodoInput>) => {
    const extra: Partial<Todo> = {};
    if (patch.status === "done") extra.doneAt = new Date().toISOString();
    if (patch.status && patch.status !== "done") extra.doneAt = "";
    await store.update(id, { ...patch, ...extra, updatedAt: new Date().toISOString() });
  }, []);

  const removeTodo = useCallback(async (id: string) => store.remove(id), []);

  return { todos, loading, addTodo, updateTodo, removeTodo };
}

// ── Dates ──────────────────────────────────────────────────────

export function dayKey(offset = 0, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export function dueBucket(due: string): DueBucket {
  if (!due) return "none";
  const t = dayKey(0);
  if (due < t) return "overdue";
  if (due === t) return "today";
  if (due === dayKey(1)) return "tomorrow";
  if (due <= dayKey(7)) return "week";
  return "later";
}

export function dueLabel(due: string): string {
  const b = dueBucket(due);
  if (b === "none") return "";
  if (b === "today") return "Aujourd'hui";
  if (b === "tomorrow") return "Demain";
  const d = new Date(`${due}T12:00:00`);
  if (b === "overdue") {
    const days = Math.round((new Date(`${dayKey(0)}T12:00:00`).getTime() - d.getTime()) / 86_400_000);
    return days === 1 ? "Hier" : `En retard de ${days} j`;
  }
  if (b === "week") {
    const w = d.toLocaleDateString("fr-FR", { weekday: "long" });
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Priorités & matrice d'Eisenhower ───────────────────────────

export const PRIORITIES: { value: Priority; label: string; short: string; color: string; ring: string; bg: string; text: string }[] = [
  { value: 1, label: "Critique", short: "P1", color: "#e11d48", ring: "ring-rose-500", bg: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  { value: 2, label: "Haute", short: "P2", color: "#f97316", ring: "ring-orange-500", bg: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  { value: 3, label: "Normale", short: "P3", color: "#3b82f6", ring: "ring-blue-500", bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  { value: 4, label: "Basse", short: "P4", color: "#94a3b8", ring: "ring-slate-400", bg: "bg-slate-400", text: "text-slate-500" },
];

export const priorityMeta = (p: Priority) => PRIORITIES[p - 1] ?? PRIORITIES[2];

export type Quadrant = "do" | "plan" | "quick" | "later";

export const QUADRANTS: { id: Quadrant; title: string; hint: string; tone: string }[] = [
  { id: "do", title: "À faire maintenant", hint: "Urgent et important", tone: "rose" },
  { id: "plan", title: "À planifier", hint: "Important, pas urgent", tone: "blue" },
  { id: "quick", title: "À expédier ou déléguer", hint: "Urgent, moins important", tone: "amber" },
  { id: "later", title: "Plus tard", hint: "Ni urgent ni important", tone: "slate" },
];

/** Important = P1/P2 ; urgent = échéance dépassée, aujourd'hui ou demain. */
export function quadrantOf(t: Pick<Todo, "priority" | "due">): Quadrant {
  const important = t.priority <= 2;
  const urgent = !!t.due && t.due <= dayKey(1);
  if (important && urgent) return "do";
  if (important) return "plan";
  if (urgent) return "quick";
  return "later";
}

/** Champs à modifier quand on glisse une tâche dans un quadrant. */
export function patchForQuadrant(t: Pick<Todo, "priority" | "due">, q: Quadrant): Partial<TodoInput> {
  const urgent = !!t.due && t.due <= dayKey(1);
  const wantImportant = q === "do" || q === "plan";
  const wantUrgent = q === "do" || q === "quick";
  const patch: Partial<TodoInput> = {};
  if (wantImportant && t.priority > 2) patch.priority = 2;
  if (!wantImportant && t.priority <= 2) patch.priority = 3;
  if (wantUrgent && !urgent) patch.due = dayKey(0);
  if (!wantUrgent && urgent) patch.due = dayKey(7);
  return patch;
}

/** Ordre d'affichage : épinglées, puis priorité, puis échéance. */
export function compareTodos(a: Todo, b: Todo): number {
  if (a.focus !== b.focus) return a.focus ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ad = a.due || "9999";
  const bd = b.due || "9999";
  if (ad !== bd) return ad.localeCompare(bd);
  return a.createdAt.localeCompare(b.createdAt);
}

// ── Saisie rapide ──────────────────────────────────────────────

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export interface QuickParse {
  title: string;
  priority?: Priority;
  due?: string;
  assigneeId?: string;
  tags: string[];
}

/**
 * « Appeler Laurent demain !1 @Sébastien #commercial »
 * → priorité (!1 à !4 ou p1 à p4), échéance (aujourd'hui, demain, après-demain, lundi…, 12/11, semaine prochaine),
 *   personne (@prénom), tags (#mot).
 */
export function parseQuickAdd(input: string, people: { uid: string; name: string }[]): QuickParse {
  let text = ` ${input} `;
  const out: QuickParse = { title: "", tags: [] };

  text = text.replace(/\s(?:!|p)([1-4])(?=\s)/i, (_, n: string) => {
    out.priority = Number(n) as Priority;
    return " ";
  });

  const n = norm(text);
  const rules: [RegExp, () => string][] = [
    [/\s(apres-demain|apres demain)(?=\s)/, () => dayKey(2)],
    [/\s(aujourd'hui|aujourdhui|auj|ce soir)(?=\s)/, () => dayKey(0)],
    [/\s(demain)(?=\s)/, () => dayKey(1)],
    [/\s(semaine prochaine)(?=\s)/, () => {
      const d = new Date();
      return dayKey(((8 - d.getDay()) % 7) || 7);
    }],
    [new RegExp(`\\s(${WEEKDAYS.join("|")})(?=\\s)`), () => ""],
    [/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/, () => ""],
  ];
  for (const [re, fn] of rules) {
    const m = re.exec(n);
    if (!m) continue;
    let due = fn();
    if (!due && WEEKDAYS.includes(m[1])) {
      const target = WEEKDAYS.indexOf(m[1]);
      const diff = (target - new Date().getDay() + 7) % 7 || 7;
      due = dayKey(diff);
    } else if (!due && m[2]) {
      const now = new Date();
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear();
      const candidate = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      if (!m[3] && candidate < dayKey(0)) y += 1;
      due = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    if (due) {
      out.due = due;
      text = text.slice(0, m.index) + " " + text.slice(m.index + m[0].length);
      break;
    }
  }

  text = text.replace(/\s@([\p{L}\-]+)/u, (all, who: string) => {
    const w = norm(who);
    const p = people.find((x) => norm(x.name).split(/\s+/)[0] === w || norm(x.name).startsWith(w));
    if (!p) return all;
    out.assigneeId = p.uid;
    return " ";
  });

  text = text.replace(/\s#([\p{L}\d_-]+)/gu, (_, tag: string) => {
    out.tags.push(tag);
    return " ";
  });

  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}
