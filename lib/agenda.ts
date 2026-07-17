"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

// Store branché sur Firestore (collection "agenda") avec cache temps réel.

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

const store = createCollectionStore<AgendaEvent>("agenda");

/** Accès direct au store (migration). */
export const agendaStore = store;

function makeId() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Ajout direct (sans hook) — utilisé par le moteur d'automatisations. */
export async function addEventRecord(input: AgendaEventInput): Promise<AgendaEvent> {
  const now = new Date().toISOString();
  const event: AgendaEvent = { ...input, id: makeId(), createdAt: now, updatedAt: now };
  await store.set(event);
  return event;
}

export function useAgenda() {
  const [events, setEvents] = useState<AgendaEvent[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setEvents(store.get());
        setLoading(false);
      }),
    [],
  );

  const addEvent = useCallback(
    async (input: AgendaEventInput): Promise<AgendaEvent> => addEventRecord(input),
    [],
  );

  const updateEvent = useCallback(
    async (id: string, input: Partial<AgendaEventInput>): Promise<void> => {
      await store.update(id, { ...input, updatedAt: new Date().toISOString() });
    },
    [],
  );

  const deleteEvent = useCallback(async (id: string): Promise<void> => {
    await store.remove(id);
  }, []);

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
