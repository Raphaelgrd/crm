"use client";

import { useCallback, useEffect, useState } from "react";

// ⚠️ Couche de données locale (localStorage), même pattern que lib/contacts.ts :
// API async calquée sur Firestore pour brancher Firebase sans toucher aux pages.

export type EventType = "rdv" | "tache";

export interface AgendaEvent {
  id: string;
  type: EventType;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM ("" pour une tâche sans heure)
  endTime: string;
  contactId: string;
  contactName: string;
  notes: string;
  visio: boolean; // RDV en visio (lien Google Meet généré après branchement OAuth)
  done: boolean; // pour les tâches
  createdAt: string;
  updatedAt: string;
}

export type AgendaEventInput = Omit<AgendaEvent, "id" | "createdAt" | "updatedAt">;

const STORAGE_KEY = "netforce.agenda";

function load(): AgendaEvent[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgendaEvent[]) : [];
  } catch {
    return [];
  }
}

function save(list: AgendaEvent[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function makeId() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useAgenda() {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setEvents(load());
    setLoading(false);
  }, []);

  const persist = useCallback((next: AgendaEvent[]) => {
    setEvents(next);
    save(next);
  }, []);

  const addEvent = useCallback(
    async (input: AgendaEventInput): Promise<AgendaEvent> => {
      const now = new Date().toISOString();
      const event: AgendaEvent = { ...input, id: makeId(), createdAt: now, updatedAt: now };
      persist([...load(), event]);
      return event;
    },
    [persist],
  );

  const updateEvent = useCallback(
    async (id: string, input: Partial<AgendaEventInput>): Promise<void> => {
      persist(
        load().map((e) =>
          e.id === id ? { ...e, ...input, updatedAt: new Date().toISOString() } : e,
        ),
      );
    },
    [persist],
  );

  const deleteEvent = useCallback(
    async (id: string): Promise<void> => {
      persist(load().filter((e) => e.id !== id));
    },
    [persist],
  );

  return { events, loading, addEvent, updateEvent, deleteEvent };
}

// --- Helpers calendrier ---

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Semaines (lundi → dimanche) couvrant le mois affiché. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  // Reculer jusqu'au lundi
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const weeks: Date[][] = [];
  const cursor = new Date(start);
  do {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month);
  return weeks;
}
