"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

// ⚠️ Couche de données locale (localStorage), même pattern que lib/contacts.ts :
// API async calquée sur Firestore pour brancher Firebase sans toucher aux pages.

export * from "@/lib/templateRender";
import { DEFAULT_SETTINGS, makeId, type EmailTemplate } from "@/lib/templateRender";

// --- Store (Firestore, collection "templates") ---

const store = createCollectionStore<EmailTemplate>("templates");

/** Accès direct au store (migration). */
export const templatesStore = store;

/** Id fixe du mail relié au bouton des fiches client : pas de doublon possible. */
export const WELCOME_TEMPLATE_ID = "welcome";

function makeWelcomeTemplate(): EmailTemplate {
  const now = new Date().toISOString();
  return {
    id: WELCOME_TEMPLATE_ID,
    name: "Mail nouveaux arrivants",
    type: "Email",
    subject: "Bienvenue {{firstName}} — ravi d'échanger avec vous",
    special: "welcome",
    blocks: [
      {
        id: makeId(),
        type: "heading",
        props: { text: "Bienvenue {{firstName}} !", align: "left", color: "#0f172a", fontSize: 24 },
      },
      {
        id: makeId(),
        type: "text",
        props: {
          text: "Bonjour {{firstName}} {{lastName}},\n\nMerci pour votre intérêt. Nous avons bien enregistré votre demande pour {{companyName}} et nous revenons vers vous très rapidement.\n\nÀ très bientôt,\nL'équipe Netforce",
          align: "left",
          color: "#334155",
          fontSize: 14,
        },
      },
    ],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

// Garantit la présence du mail spécial (une seule tentative par session).
let welcomeEnsured = false;
function ensureWelcomeTemplate() {
  if (welcomeEnsured || !store.ready()) return;
  if (!store.get().some((t) => t.special === "welcome")) {
    welcomeEnsured = true;
    void store.set(makeWelcomeTemplate());
  } else {
    welcomeEnsured = true;
  }
}

function sorted(list: EmailTemplate[]): EmailTemplate[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function useTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>(sorted(store.get()));
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        ensureWelcomeTemplate();
        setTemplates(sorted(store.get()));
        setLoading(false);
      }),
    [],
  );

  const getTemplate = useCallback(async (id: string): Promise<EmailTemplate | null> => {
    const cached = store.get().find((t) => t.id === id);
    if (cached) return cached;
    // Cache pas encore prêt : attendre la première synchro.
    return new Promise((resolve) => {
      const unsub = store.subscribe(() => {
        if (store.ready()) {
          unsub();
          resolve(store.get().find((t) => t.id === id) ?? null);
        }
      });
    });
  }, []);

  const addTemplate = useCallback(
    async (input: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">): Promise<EmailTemplate> => {
      const now = new Date().toISOString();
      const t: EmailTemplate = { ...input, id: makeId("t"), createdAt: now, updatedAt: now };
      await store.set(t);
      return t;
    },
    [],
  );

  const updateTemplate = useCallback(
    async (id: string, input: Partial<Omit<EmailTemplate, "id" | "createdAt">>): Promise<void> => {
      await store.update(id, { ...input, updatedAt: new Date().toISOString() });
    },
    [],
  );

  const deleteTemplate = useCallback(async (id: string): Promise<void> => {
    await store.remove(id);
  }, []);

  const duplicateTemplate = useCallback(
    async (id: string): Promise<EmailTemplate | null> => {
      const source = store.get().find((t) => t.id === id);
      if (!source) return null;
      const now = new Date().toISOString();
      const copy: EmailTemplate = {
        ...source,
        id: makeId("t"),
        name: `${source.name} (copie)`,
        special: undefined,
        blocks: source.blocks.map((b) => ({ ...b, id: makeId(), props: { ...b.props } })),
        createdAt: now,
        updatedAt: now,
      };
      await store.set(copy);
      return copy;
    },
    [],
  );

  return {
    templates,
    loading,
    getTemplate,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
  };
}
