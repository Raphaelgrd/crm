"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

// Journal d'activité par contact : notes, appels, emails, RDV saisis à la main,
// + événements automatiques (changement d'étape, email envoyé, prêt de G.I.E).

export type ActivityType = "note" | "call" | "email" | "meeting" | "stage" | "loan" | "task";

export interface Activity {
  id: string;
  contactId: string;
  type: ActivityType;
  text: string;
  at: string; // ISO datetime
  /** true = généré automatiquement (non supprimable manuellement). */
  auto: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ActivityInput = Omit<Activity, "id" | "createdAt" | "updatedAt">;

/** Types saisissables à la main dans la timeline. */
export const MANUAL_ACTIVITY_TYPES: { id: ActivityType; label: string }[] = [
  { id: "note", label: "Note" },
  { id: "call", label: "Appel" },
  { id: "email", label: "Email" },
  { id: "meeting", label: "RDV" },
];

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  note: "Note",
  call: "Appel",
  email: "Email",
  meeting: "RDV",
  stage: "Étape",
  loan: "Prêt",
  task: "Tâche",
};

const store = createCollectionStore<Activity>("activities");

/** Accès direct au store (migration). */
export const activitiesStore = store;

function makeId() {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Journalise une activité (utilisable hors composant : runner, pages…). */
export async function logActivity(input: {
  contactId: string;
  type: ActivityType;
  text: string;
  at?: string;
  auto?: boolean;
}): Promise<void> {
  if (!input.contactId) return;
  const now = new Date().toISOString();
  await store.set({
    id: makeId(),
    contactId: input.contactId,
    type: input.type,
    text: input.text,
    at: input.at ?? now,
    auto: input.auto ?? false,
    createdAt: now,
    updatedAt: now,
  });
}

/** Timeline d'un contact (plus récent en premier) + ajout / suppression. */
export function useContactActivities(contactId: string) {
  const [all, setAll] = useState<Activity[]>(store.get());

  useEffect(() => store.subscribe(() => setAll(store.get())), []);

  const activities = useMemo(
    () =>
      all
        .filter((a) => a.contactId === contactId)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [all, contactId],
  );

  const addActivity = useCallback(
    async (type: ActivityType, text: string): Promise<void> => {
      await logActivity({ contactId, type, text });
    },
    [contactId],
  );

  const deleteActivity = useCallback(async (id: string): Promise<void> => {
    await store.remove(id);
  }, []);

  return { activities, addActivity, deleteActivity };
}
