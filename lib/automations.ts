"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Contact,
  CrmEvent,
  StageName,
  applyContactPatch,
  contactFullName,
  requestDataRefresh,
} from "@/lib/contacts";
import { addEventRecord, toDateKey } from "@/lib/agenda";

// ⚠️ Couche de données locale (localStorage), même pattern que lib/contacts.ts.
// Le moteur s'exécute dans le navigateur via AutomationRunner (monté dans le
// layout) qui écoute les événements CRM émis par les stores.

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

const STORAGE_KEY = "netforce.automations";
const LOG_KEY = "netforce.automations.log";
const QUEUE_KEY = "netforce.emailqueue";
const LOG_LIMIT = 100;

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

const loadAutomations = () => loadJson<Automation[]>(STORAGE_KEY, []);
const loadLog = () => loadJson<ExecutionLog[]>(LOG_KEY, []);
const loadQueue = () => loadJson<QueuedEmail[]>(QUEUE_KEY, []);

// --- Moteur ---

function actionSummary(action: Action, contact: Contact): string {
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

function executeActions(automation: Automation, contact: Contact): string[] {
  const summary: string[] = [];
  for (const action of automation.actions) {
    switch (action.type) {
      case "send_email": {
        const queue = loadQueue();
        queue.push({
          id: makeId("q"),
          contactId: contact.id,
          templateId: action.templateId,
          automationName: automation.name,
          at: new Date().toISOString(),
        });
        saveJson(QUEUE_KEY, queue);
        break;
      }
      case "create_task": {
        const due = new Date();
        due.setDate(due.getDate() + action.dueInDays);
        addEventRecord({
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
        applyContactPatch(contact.id, { stage: action.stage });
        break;
      case "set_category":
        applyContactPatch(contact.id, { category: action.category });
        break;
    }
    summary.push(actionSummary(action, contact));
  }
  return summary;
}

/** Exécute les automatisations qui matchent l'événement. */
export function runAutomationsForEvent(event: CrmEvent) {
  const automations = loadAutomations();
  const matching = automations.filter((a) => {
    if (!a.active || a.trigger.type !== event.type) return false;
    if (event.type === "stage_changed" && a.trigger.stage && a.trigger.stage !== event.to) {
      return false;
    }
    return true;
  });
  if (matching.length === 0) return;

  const log = loadLog();
  for (const automation of matching) {
    const summary = executeActions(automation, event.contact);
    log.unshift({
      id: makeId("l"),
      automationName: automation.name,
      contactName: contactFullName(event.contact) || event.contact.email,
      summary,
      at: new Date().toISOString(),
    });
    automation.runs += 1;
  }
  saveJson(LOG_KEY, log.slice(0, LOG_LIMIT));
  saveJson(STORAGE_KEY, automations);
  requestDataRefresh();
}

// --- Hooks ---

export function useAutomations() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [log, setLog] = useState<ExecutionLog[]>([]);
  const [queue, setQueue] = useState<QueuedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setAutomations(loadAutomations());
    setLog(loadLog());
    setQueue(loadQueue());
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("netforce:data-refresh", reload);
    return () => window.removeEventListener("netforce:data-refresh", reload);
  }, [reload]);

  const getAutomation = useCallback(
    async (id: string): Promise<Automation | null> =>
      loadAutomations().find((a) => a.id === id) ?? null,
    [],
  );

  const addAutomation = useCallback(
    async (input: AutomationInput): Promise<Automation> => {
      const now = new Date().toISOString();
      const automation: Automation = { ...input, id: makeId("a"), runs: 0, createdAt: now, updatedAt: now };
      saveJson(STORAGE_KEY, [automation, ...loadAutomations()]);
      reload();
      return automation;
    },
    [reload],
  );

  const updateAutomation = useCallback(
    async (id: string, input: Partial<AutomationInput>): Promise<void> => {
      saveJson(
        STORAGE_KEY,
        loadAutomations().map((a) =>
          a.id === id ? { ...a, ...input, updatedAt: new Date().toISOString() } : a,
        ),
      );
      reload();
    },
    [reload],
  );

  const deleteAutomation = useCallback(
    async (id: string): Promise<void> => {
      saveJson(STORAGE_KEY, loadAutomations().filter((a) => a.id !== id));
      reload();
    },
    [reload],
  );

  const removeFromQueue = useCallback(
    async (id: string): Promise<void> => {
      saveJson(QUEUE_KEY, loadQueue().filter((q) => q.id !== id));
      reload();
    },
    [reload],
  );

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
