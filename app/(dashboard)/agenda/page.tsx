"use client";

import { useMemo, useState } from "react";
import { Video, Calendar, Bookmark, ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  AgendaEvent,
  AgendaEventInput,
  monthGrid,
  toDateKey,
  useAgenda,
} from "@/lib/agenda";
import EventModal from "@/components/agenda/EventModal";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function AgendaPage() {
  const today = new Date();
  const todayKey = toDateKey(today);
  const { events, addEvent, updateEvent, deleteEvent } = useAgenda();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | null>(null);
  const [defaults, setDefaults] = useState<Partial<AgendaEventInput>>({});

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
    }
    return map;
  }, [events]);

  const navigate = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const openCreate = (extra: Partial<AgendaEventInput>) => {
    setEditing(null);
    setDefaults({ date: todayKey, ...extra });
    setModalOpen(true);
  };

  const openEdit = (event: AgendaEvent) => {
    setEditing(event);
    setModalOpen(true);
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-crms-bg flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex flex-col items-center">
                <div className="text-2xl font-bold text-gray-900 sm:text-3xl">
                  {today.getDate()}
                </div>
                <div className="text-[10px] font-medium text-gray-500 uppercase sm:text-xs">
                  {today.toLocaleDateString("fr-FR", { month: "short" })}
                </div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Agenda
                </h1>
                <p className="text-xs text-gray-500 sm:text-sm">
                  {today.toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => openCreate({ type: "rdv", visio: true })}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
              >
                <Video className="h-4 w-4" aria-hidden="true" />
                Google Meet
              </button>
              <button
                type="button"
                onClick={() => openCreate({ type: "rdv" })}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Calendar className="h-4 w-4" aria-hidden="true" />
                Rendez-vous
              </button>
              <button
                type="button"
                onClick={() => openCreate({ type: "tache" })}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                Tâche
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => openCreate({ type: "rdv", visio: true })}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              <Video className="h-3.5 w-3.5" aria-hidden="true" />
              Meet
            </button>
            <button
              type="button"
              onClick={() => openCreate({ type: "rdv" })}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              RDV
            </button>
          </div>
        </div>

        {/* Navigation du calendrier */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="hover:bg-muted rounded-lg border border-gray-200 p-1.5 transition-colors"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4 text-gray-500" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="hover:bg-muted rounded-lg border border-gray-200 p-1.5 transition-colors"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setYear(today.getFullYear());
              setMonth(today.getMonth());
            }}
            className="hover:bg-muted rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors"
          >
            Aujourd&apos;hui
          </button>
          <span className="text-foreground ml-2 text-sm font-semibold capitalize">
            {monthLabel}
          </span>
        </div>
      </div>

      {/* Grille du calendrier */}
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-(--shadow-card)">
          <div className="border-border grid shrink-0 grid-cols-7 border-b">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-muted-foreground px-2 py-2 text-center text-xs font-semibold uppercase"
              >
                {d}
              </div>
            ))}
          </div>
          <div
            className="grid min-h-0 flex-1 grid-cols-7"
            style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          >
            {weeks.flat().map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === month;
              const isToday = key === todayKey;
              const dayEvents = byDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  onClick={() => {
                    setEditing(null);
                    setDefaults({ date: key, type: "rdv" });
                    setModalOpen(true);
                  }}
                  className={
                    "border-border hover:bg-muted/50 min-h-20 cursor-pointer overflow-hidden border-r border-b p-1.5 transition-colors " +
                    (inMonth ? "" : "bg-muted/40")
                  }
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold " +
                        (isToday
                          ? "bg-primary text-primary-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-gray-300")
                      }
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                        className={
                          "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-80 " +
                          (e.type === "rdv"
                            ? e.visio
                              ? "bg-green-100 text-green-800"
                              : "bg-blue-100 text-blue-800"
                            : e.done
                              ? "bg-gray-100 text-gray-400 line-through"
                              : "bg-amber-100 text-amber-800")
                        }
                        title={e.title}
                      >
                        {e.type === "tache" && e.done && (
                          <Check className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                        )}
                        {e.startTime && <span className="font-semibold">{e.startTime} </span>}
                        {e.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-muted-foreground px-1.5 text-[10px]">
                        +{dayEvents.length - 3} autres
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <EventModal
        open={modalOpen}
        initial={editing}
        defaults={defaults}
        onClose={() => setModalOpen(false)}
        onSave={async (input) => {
          if (editing) await updateEvent(editing.id, input);
          else await addEvent(input);
        }}
        onDelete={deleteEvent}
      />
    </div>
  );
}
