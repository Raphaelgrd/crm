"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";
import { CrmEvent, StageName } from "@/lib/contacts";
import { authFetch } from "@/lib/rapport";

// Automatisations : lues en temps réel ici, enregistrées et exécutées par le serveur
// (lib/server/automations.ts). L'écran transmet ses événements via AutomationRunner ;
// le formulaire du site, l'assistant IA et le connecteur MCP déclenchent directement côté serveur.

export type TriggerType = "contact_created" | "stage_changed";

export interface Trigger {
  type: TriggerType;
  /** Pour stage_changed : étape d'arrivée ("" = n'importe laquelle). */
  stage: StageName | "";
  /** Limite aux contacts de cette catégorie (absent = tous). */
  category?: string;
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

/** Transmet un événement de l'écran au serveur, qui exécute les automatisations correspondantes. */
export async function runAutomationsForEvent(event: CrmEvent): Promise<void> {
  await authFetch("/api/automations/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      event.type === "stage_changed"
        ? { type: event.type, contactId: event.contact.id, from: event.from, to: event.to }
        : { type: event.type, contactId: event.contact.id },
    ),
  }).catch(() => {});
}

/** Appel API ; renvoie le message d'erreur du serveur si besoin. */
async function api(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await authFetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Enregistrement impossible.");
  return data;
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
    const { automation } = (await api("/api/automations", "POST", input)) as { automation: Automation };
    return automation;
  }, []);

  const updateAutomation = useCallback(
    async (id: string, input: Partial<AutomationInput>): Promise<void> => {
      await api(`/api/automations/${id}`, "PATCH", input);
    },
    [],
  );

  const deleteAutomation = useCallback(async (id: string): Promise<void> => {
    await api(`/api/automations/${id}`, "DELETE");
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
