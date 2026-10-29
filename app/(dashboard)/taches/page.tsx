"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid2x2, ListTodo, SquareKanban, Sun, Users } from "lucide-react";
import { useCrmUser, useTeamMembers } from "@/lib/rapport";
import { contactsStore } from "@/lib/contacts";
import { compareTodos, dayKey, dueBucket, patchForQuadrant, useTodos, type Todo, type TodoInput } from "@/lib/todos";
import { Avatar, QuickAdd, TodoDrawer, TodoRow, type Person } from "@/components/todos/TodoUI";
import { BoardView, DayView, ListView, MatrixView, PersonDay } from "@/components/todos/TodoViews";

type View = "day" | "matrix" | "board" | "list";

const VIEWS: { id: View; label: string; icon: typeof Sun }[] = [
  { id: "day", label: "Ma journée", icon: Sun },
  { id: "matrix", label: "Matrice", icon: Grid2x2 },
  { id: "board", label: "Tableau", icon: SquareKanban },
  { id: "list", label: "Liste", icon: ListTodo },
];


function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
}

export default function TachesPage() {
  const { user, name } = useCrmUser();
  const { members } = useTeamMembers();
  const { todos, loading, addTodo, updateTodo, removeTodo } = useTodos();
  const [view, setView] = useState<View>("day");
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);

  const me: Person = useMemo(() => ({ uid: user?.uid ?? "", name: name || "Moi" }), [user?.uid, name]);

  const people: Person[] = useMemo(() => {
    const list = members.filter((m) => !m.isBot && m.member !== false).map((m) => ({ uid: m.uid, name: m.name }));
    if (me.uid && !list.some((p) => p.uid === me.uid)) list.unshift(me);
    return list.sort((a, b) => (a.uid === me.uid ? -1 : b.uid === me.uid ? 1 : a.name.localeCompare(b.name)));
  }, [members, me]);

  useEffect(() => {
    if (!me.uid) return;
    setView(readPref<View>("taches.view", "day"));
    setSelected(readPref<string[]>(`taches.people.${me.uid}`, [me.uid]));
  }, [me.uid]);

  useEffect(
    () =>
      contactsStore.subscribe(() =>
        setContacts(
          contactsStore.get().map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() || c.email })),
        ),
      ),
    [],
  );

  const pickView = (v: View) => {
    setView(v);
    writePref("taches.view", v);
  };
  const togglePerson = (uid: string) => {
    const next = selected.includes(uid) ? selected.filter((x) => x !== uid) : [...selected, uid];
    const final = next.length ? next : [me.uid];
    setSelected(final);
    writePref(`taches.people.${me.uid}`, final);
  };
  const selectAll = () => {
    const all = people.map((p) => p.uid);
    setSelected(all);
    writePref(`taches.people.${me.uid}`, all);
  };

  const byUid = useMemo(() => Object.fromEntries(people.map((p) => [p.uid, p])), [people]);
  const visible = useMemo(
    () => todos.filter((t) => selected.includes(t.ownerId)).sort(compareTodos),
    [todos, selected],
  );
  const multi = selected.length > 1;
  const openTodo = todos.find((t) => t.id === openId) ?? null;

  const toggle = (t: Todo) => void updateTodo(t.id, { status: t.status === "done" ? "todo" : "done", focus: t.status === "done" ? t.focus : false });
  const pin = (t: Todo) => void updateTodo(t.id, { focus: !t.focus });

  const rowProps = (t: Todo, draggable = false) => ({
    todo: t,
    owner: byUid[t.ownerId] ?? { uid: t.ownerId, name: t.ownerName },
    showOwner: multi,
    onToggle: () => toggle(t),
    onOpen: () => setOpenId(t.id),
    onFocus: () => pin(t),
    draggable,
  });

  const add = (input: TodoInput) => addTodo(input);

  const open = visible.filter((t) => t.status !== "done");
  const mineOverdue = todos.filter((t) => t.ownerId === me.uid && t.status !== "done" && dueBucket(t.due) === "overdue").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Mes tâches</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {open.length} à faire
            {mineOverdue > 0 && <span className="font-semibold text-rose-600"> · {mineOverdue} en retard</span>}
            {" · "}
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <nav className="bg-muted inline-flex rounded-xl p-1" aria-label="Vues">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => pickView(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${view === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Personnes */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Users className="text-muted-foreground mr-1 h-4 w-4" aria-hidden="true" />
        {people.map((p) => {
          const on = selected.includes(p.uid);
          const count = todos.filter((t) => t.ownerId === p.uid && t.status !== "done").length;
          return (
            <button
              key={p.uid}
              type="button"
              onClick={() => togglePerson(p.uid)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-xs font-medium transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              <Avatar person={p} />
              {p.uid === me.uid ? "Moi" : p.name}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
        {people.length > 2 && selected.length < people.length && (
          <button type="button" onClick={selectAll} className="text-muted-foreground hover:text-foreground px-2 text-xs underline">
            Toute l&apos;équipe
          </button>
        )}
      </div>

      <div className="mb-6">
        <QuickAdd people={people} me={me} defaultDue={view === "day" ? dayKey(0) : undefined} onAdd={add} />
      </div>

      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">Chargement…</p>
      ) : view === "day" ? (
        multi ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {selected.map((uid) => (
              <PersonDay
                key={uid}
                person={byUid[uid] ?? { uid, name: "?" }}
                todos={todos.filter((t) => t.ownerId === uid)}
                row={(t) => <TodoRow key={t.id} {...rowProps(t)} showOwner={false} />}
              />
            ))}
          </div>
        ) : (
          <DayView todos={visible} allMine={todos.filter((t) => t.ownerId === selected[0])} row={(t) => <TodoRow key={t.id} {...rowProps(t)} />} onPin={pin} onToggle={toggle} onOpen={setOpenId} />
        )
      ) : view === "matrix" ? (
        <MatrixView todos={open} row={(t) => <TodoRow key={t.id} {...rowProps(t, true)} />} onDrop={(id, q) => {
          const t = todos.find((x) => x.id === id);
          if (t) void updateTodo(id, patchForQuadrant(t, q));
        }} />
      ) : view === "board" ? (
        <BoardView todos={visible} row={(t) => <TodoRow key={t.id} {...rowProps(t, true)} />} onDrop={(id, s) => void updateTodo(id, { status: s })} />
      ) : (
        <ListView todos={visible} row={(t) => <TodoRow key={t.id} {...rowProps(t)} />} />
      )}

      {openTodo && (
        <TodoDrawer
          todo={openTodo}
          people={people}
          contacts={contacts}
          onClose={() => setOpenId(null)}
          onSave={(patch) => updateTodo(openTodo.id, patch)}
          onDelete={async () => {
            await removeTodo(openTodo.id);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

