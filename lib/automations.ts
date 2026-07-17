"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";
import {
  Contact,
  CrmEvent,
  StageName,
  applyContactPatch,
  contactFullName,
} from "@/lib/contacts";
import { addEventRecord, toDateKey } from "@/lib/agenda";

// Moteur branché sur Firestore. Il s'exécute dans le navigateur via
// AutomationRunner (monté dans le layout) qui écoute les événements CRM.

export type TriggerType = "contact_created" | "stage_changed";

export interface Trigger {
  type: TriggerType;
  /** Pour stage_changed : étape d'arrivée ("" = n'importe laquelle). */
  stage: StageName | "";
}

export type Action =
  | { type: "send_email"; templateId: string }
  | { type: "create_task"; title: string; dueInDays: number }
  | { type: "set_stage"; stage: StageName }
  | { type: "set_category"; category: string };

export interface Automation {
  id: string;
  name: string;
  description: string;
  active: boolean;
  trigger: Trigger;
  actions: Action[];
  runs: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionLog {
  id: string;
  automationName: string;
  contactName: string;
  summary: string[];
  at: string;
}

export interface QueuedEmail {
  id: string;
  contactId: string;
  templateId: string;
  automationName: string;
  at: string;
}

export type AutomationInput = Omit<Automation, "id" | "runs" | "createdAt" | "updatedAt">;

const automationsStore = createCollectionStore<Automation>("automations");
const logStore = createCollectionStore<ExecutionLog>("automationLog");
const queueStore = createCollectionStore<QueuedEmail>("emailQueue");

/** Accès direct aux stores (migration, runner). */
export const automationStores = {
  automations: automationsStore,
  log: logStore,
  queue: queueStore,
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Moteur ---

function actionSummary(action: Action): string {
  switch (action.type) {
    case "send_email":
      return `Mail ajouté à la file d'attente`;
    case "create_task":
      return `Tâche créée : « ${action.title} »`;
    case "set_stage":
      return `Étape → ${action.stage}`;
    case "set_category":
      return `Catégorie → ${action.category}`;
  }
}

async function executeActions(automation: Automation, contact: Contact): Promise<string[]> {
  const summary: string[] = [];
  for (const action of automation.actions) {
    switch (action.type) {
      case "send_email":
        await queueStore.set({
          id: makeId("q"),
          contactId: contact.id,
          templateId: action.templateId,
          automationName: automation.name,
          at: new Date().toISOString(),
        });
        break;
      case "create_task": {
        const due = new Date();
        due.setDate(due.getDate() + action.dueInDays);
        await addEventRecord({
          type: "tache",
          title: action.title,
          date: toDateKey(due),
          startTime: "",
          endTime: "",
          contactId: contact.id,
          contactName: contactFullName(contact) || contact.email,
          notes: `Créée par l'automatisation « ${automation.name} »`,
          visio: false,
          done: false,
        });
        break;
      }
      case "set_stage":
        await applyContactPatch(contact.id, { stage: action.stage });
        break;
      case "set_category":
        await applyContactPatch(contact.id, { category: action.category });
        break;
    }
    summary.push(actionSummary(action));
  }
  return summary;
}

/** Exécute les automatisations qui matchent l'événement. */
export async function runAutomationsForEvent(event: CrmEvent): Promise<void> {
  const matching = automationsStore.get().filter((a) => {
    if (!a.active || a.trigger.type !== event.type) return false;
    if (event.type === "stage_changed" && a.trigger.stage && a.trigger.stage !== event.to) {
      return false;
    }
    return true;
  });

  for (const automation of matching) {
    const summary = await executeActions(automation, event.contact);
    await logStore.set({
      id: makeId("l"),
      automationName: automation.name,
      contactName: contactFullName(event.contact) || event.contact.email,
      summary,
      at: new Date().toISOString(),
    });
    await automationsStore.update(automation.id, { runs: automation.runs + 1 });
  }
}

// --- Hooks ---

export function useAutomations() {
  const [automations, setAutomations] = useState<Automation[]>(automationsStore.get());
  const [log, setLog] = useState<ExecutionLog[]>(logStore.get());
  const [queue, setQueue] = useState<QueuedEmail[]>(queueStore.get());
  const [loading, setLoading] = useState(!automationsStore.ready());

  useEffect(() => {
    const unsubs = [
      automationsStore.subscribe(() => {
        setAutomations(
          [...automationsStore.get()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
        setLoading(false);
      }),
      logStore.subscribe(() =>
        setLog([...logStore.get()].sort((a, b) => b.at.localeCompare(a.at))),
      ),
      queueStore.subscribe(() =>
        setQueue([...queueStore.get()].sort((a, b) => b.at.localeCompare(a.at))),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const getAutomation = useCallback(async (id: string): Promise<Automation | null> => {
    const cached = automationsStore.get().find((a) => a.id === id);
    if (cached) return cached;
    return new Promise((resolve) => {
      const unsub = automationsStore.subscribe(() => {
        if (automationsStore.ready()) {
          unsub();
          resolve(automationsStore.get().find((a) => a.id === id) ?? null);
        }
      });
    });
  }, []);

  const addAutomation = useCallback(async (input: AutomationInput): Promise<Automation> => {
    const now = new Date().toISOString();
    const automation: Automation = {
      ...input,
      id: makeId("a"),
      runs: 0,
      createdAt: now,
      updatedAt: now,
    };
    await automationsStore.set(automation);
    return automation;
  }, []);

  const updateAutomation = useCallback(
    async (id: string, input: Partial<AutomationInput>): Promise<void> => {
      await automationsStore.update(id, { ...input, updatedAt: new Date().toISOString() });
    },
    [],
  );

  const deleteAutomation = useCallback(async (id: string): Promise<void> => {
    await automationsStore.remove(id);
  }, []);

  const removeFromQueue = useCallback(async (id: string): Promise<void> => {
    await queueStore.remove(id);
  }, []);

  return {
    automations,
    log,
    queue,
    loading,
    getAutomation,
    addAutomation,
    updateAutomation,
    deleteAutomation,
    removeFromQueue,
  };
}
