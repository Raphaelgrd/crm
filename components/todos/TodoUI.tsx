"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Hash, Star, Trash2, UserRound, X } from "lucide-react";
import {
  PRIORITIES,
  dayKey,
  dueBucket,
  dueLabel,
  parseQuickAdd,
  priorityMeta,
  type Priority,
  type Todo,
  type TodoInput,
  type TodoStatus,
} from "@/lib/todos";

export interface Person {
  uid: string;
  name: string;
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const AVATAR_COLORS = ["bg-violet-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-pink-500", "bg-teal-500"];
export function avatarColor(uid: string) {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ person, size = "sm" }: { person: Person; size?: "sm" | "md" }) {
  return (
    <span
      title={person.name}
      className={`${avatarColor(person.uid)} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]"}`}
    >
      {initialsOf(person.name) || "?"}
    </span>
  );
}

const BUCKET_CHIP: Record<string, string> = {
  overdue: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  today: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  tomorrow: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  week: "bg-muted text-foreground",
  later: "bg-muted text-muted-foreground",
};

export function DueChip({ due }: { due: string }) {
  if (!due) return null;
  const b = dueBucket(due);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${BUCKET_CHIP[b]}`}>
      <CalendarDays className="h-3 w-3" aria-hidden="true" />
      {dueLabel(due)}
    </span>
  );
}

/** Case à cocher ronde colorée par priorité (convention Todoist). */
export function CheckCircle({ todo, onToggle, size = "md" }: { todo: Todo; onToggle: () => void; size?: "md" | "lg" }) {
  const meta = priorityMeta(todo.priority);
  const done = todo.status === "done";
  const dim = size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={done ? "Marquer comme à faire" : "Marquer comme faite"}
      className={`group/check flex ${dim} shrink-0 items-center justify-center rounded-full border-2 transition-colors`}
      style={{ borderColor: meta.color, backgroundColor: done ? meta.color : `${meta.color}14` }}
    >
      <Check
        className={`h-3 w-3 transition-opacity ${done ? "text-white opacity-100" : "opacity-0 group-hover/check:opacity-60"}`}
        style={done ? undefined : { color: meta.color }}
        strokeWidth={3}
        aria-hidden="true"
      />
    </button>
  );
}

export function TodoRow({
  todo,
  owner,
  showOwner,
  onToggle,
  onOpen,
  onFocus,
  draggable = false,
}: {
  todo: Todo;
  owner?: Person;
  showOwner: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onFocus: () => void;
  draggable?: boolean;
}) {
  const done = todo.status === "done";
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/todo", todo.id)}
      onClick={onOpen}
      className={`group border-border bg-card hover:border-primary/30 flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-all hover:shadow-sm ${done ? "opacity-60" : ""}`}
    >
      <div className="pt-0.5">
        <CheckCircle todo={todo} onToggle={onToggle} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-foreground text-sm leading-snug ${done ? "line-through" : "font-medium"}`}>{todo.title}</p>
        {(todo.due || todo.tags.length > 0 || todo.contactName || todo.notes || todo.status === "doing") && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {todo.status === "doing" && (
              <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                En cours
              </span>
            )}
            {!done && <DueChip due={todo.due} />}
            {todo.contactName && (
              <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]">
                <UserRound className="h-3 w-3" aria-hidden="true" />
                {todo.contactName}
              </span>
            )}
            {todo.tags.map((t) => (
              <span key={t} className="text-muted-foreground inline-flex items-center text-[11px]">
                <Hash className="h-3 w-3" aria-hidden="true" />
                {t}
              </span>
            ))}
            {todo.notes && <span className="text-muted-foreground truncate text-[11px]">· {todo.notes.split("\n")[0]}</span>}
          </div>
        )}
      </div>
      {showOwner && owner && <Avatar person={owner} />}
      {!done && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          aria-label={todo.focus ? "Retirer du Top 3" : "Ajouter au Top 3"}
          title={todo.focus ? "Retirer du Top 3" : "Ajouter au Top 3 du jour"}
          className={`shrink-0 rounded p-0.5 transition-opacity ${todo.focus ? "text-amber-500" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
        >
          <Star className="h-4 w-4" fill={todo.focus ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Saisie rapide ──────────────────────────────────────────────

export function QuickAdd({
  people,
  me,
  defaultDue,
  onAdd,
}: {
  people: Person[];
  me: Person;
  defaultDue?: string;
  onAdd: (input: TodoInput) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseQuickAdd(value, people), [value, people]);
  const assignee = people.find((p) => p.uid === parsed.assigneeId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = async () => {
    if (!parsed.title) return;
    const owner = assignee ?? me;
    await onAdd({
      title: parsed.title,
      notes: "",
      ownerId: owner.uid,
      ownerName: owner.name,
      priority: parsed.priority ?? 3,
      due: parsed.due ?? defaultDue ?? "",
      status: "todo",
      focus: false,
      tags: parsed.tags,
      contactId: "",
      contactName: "",
      createdBy: me.uid,
      doneAt: "",
    });
    setValue("");
  };

  const meta = parsed.priority ? priorityMeta(parsed.priority) : null;

  return (
    <div className="border-border bg-card focus-within:border-primary/50 focus-within:ring-primary/15 rounded-xl border shadow-sm focus-within:ring-4">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="border-muted-foreground/40 h-5 w-5 shrink-0 rounded-full border-2 border-dashed" aria-hidden="true" />
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") setValue("");
          }}
          placeholder="Ajouter une tâche…  ex : Relancer le ministère demain !1 #commercial"
          className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
          aria-label="Ajouter une tâche"
        />
        <kbd className="text-muted-foreground border-border hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">N</kbd>
      </div>
      {value.trim() && (
        <div className="border-border flex flex-wrap items-center gap-1.5 border-t px-4 py-2 text-[11px]">
          <span className="text-muted-foreground">Entrée pour ajouter</span>
          {meta && (
            <span className="rounded-md px-1.5 py-0.5 font-bold text-white" style={{ backgroundColor: meta.color }}>
              {meta.short} · {meta.label}
            </span>
          )}
          {(parsed.due || defaultDue) && <DueChip due={parsed.due ?? defaultDue ?? ""} />}
          {assignee && (
            <span className="bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-0.5">
              <Avatar person={assignee} /> {assignee.name}
            </span>
          )}
          {parsed.tags.map((t) => (
            <span key={t} className="bg-muted rounded-md px-1.5 py-0.5">
              #{t}
            </span>
          ))}
          <span className="text-muted-foreground ml-auto hidden md:inline">!1 à !4 priorité · demain, lundi, 12/11 · @prénom · #tag</span>
        </div>
      )}
    </div>
  );
}

// ── Panneau d'édition ──────────────────────────────────────────

const STATUS_LABEL: Record<TodoStatus, string> = { todo: "À faire", doing: "En cours", done: "Fait" };

export function TodoDrawer({
  todo,
  people,
  contacts,
  onClose,
  onSave,
  onDelete,
}: {
  todo: Todo;
  people: Person[];
  contacts: { id: string; name: string }[];
  onClose: () => void;
  onSave: (patch: Partial<TodoInput>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes);
  const [contactQuery, setContactQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(todo.title);
    setNotes(todo.notes);
  }, [todo.id, todo.title, todo.notes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (patch: Partial<TodoInput>) => void onSave(patch);
  const matches = contactQuery.trim().length >= 2
    ? contacts.filter((c) => c.name.toLowerCase().includes(contactQuery.toLowerCase())).slice(0, 6)
    : [];

  const quickDates: [string, string][] = [
    ["Aujourd'hui", dayKey(0)],
    ["Demain", dayKey(1)],
    ["Dans 3 j", dayKey(3)],
    ["Semaine pro.", dayKey(7)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="bg-card border-border flex h-full w-full max-w-md flex-col border-l shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        aria-label="Détail de la tâche"
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <div className="flex gap-1">
            {(["todo", "doing", "done"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => save({ status: s })}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${todo.status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1" aria-label="Fermer">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== todo.title && save({ title: title.trim() })}
            rows={2}
            className="text-foreground w-full resize-none bg-transparent text-lg font-bold focus:outline-none"
            aria-label="Titre"
          />

          <section>
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">Priorité</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => save({ priority: p.value as Priority })}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${todo.priority === p.value ? "text-white shadow-sm" : "border-border text-foreground hover:bg-muted"}`}
                  style={todo.priority === p.value ? { backgroundColor: p.color, borderColor: p.color } : undefined}
                >
                  <span className="block">{p.short}</span>
                  <span className="block text-[10px] font-normal opacity-90">{p.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">Échéance</p>
            <div className="flex flex-wrap gap-1.5">
              {quickDates.map(([label, d]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => save({ due: d })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${todo.due === d ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                value={todo.due}
                onChange={(e) => save({ due: e.target.value })}
                className="border-border bg-card rounded-lg border px-2 py-1 text-xs"
                aria-label="Date d'échéance"
              />
              {todo.due && (
                <button type="button" onClick={() => save({ due: "" })} className="text-muted-foreground px-1 text-xs underline">
                  Retirer
                </button>
              )}
            </div>
          </section>

          <section>
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">Responsable</p>
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => save({ ownerId: p.uid, ownerName: p.name })}
                  className={`inline-flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-xs font-medium ${todo.ownerId === p.uid ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                >
                  <Avatar person={p} />
                  {p.name}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">Contact lié</p>
            {todo.contactName ? (
              <div className="bg-muted flex items-center justify-between rounded-lg px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  {todo.contactName}
                </span>
                <button type="button" onClick={() => save({ contactId: "", contactName: "" })} className="text-muted-foreground text-xs underline">
                  Retirer
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Chercher un contact…"
                  className="border-border bg-card w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                />
                {matches.length > 0 && (
                  <ul className="border-border bg-card absolute z-10 mt-1 w-full overflow-hidden rounded-lg border shadow-lg">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            save({ contactId: c.id, contactName: c.name });
                            setContactQuery("");
                          }}
                          className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section>
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== todo.notes && save({ notes })}
              rows={5}
              placeholder="Détails, liens, prochaines étapes…"
              className="border-border bg-card w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none"
            />
          </section>

          <button
            type="button"
            onClick={() => save({ focus: !todo.focus })}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${todo.focus ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "border-border hover:bg-muted"}`}
          >
            <Star className="h-4 w-4" fill={todo.focus ? "currentColor" : "none"} aria-hidden="true" />
            {todo.focus ? "Dans le Top 3 du jour" : "Ajouter au Top 3 du jour"}
          </button>
        </div>

        <div className="border-border flex items-center justify-between border-t px-5 py-3">
          <span className="text-muted-foreground text-[11px]">
            Créée le {new Date(todo.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
          {confirmDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Confirmer la suppression
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Supprimer
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
