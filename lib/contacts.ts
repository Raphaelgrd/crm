"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

// Store branché sur Firestore (collection "contacts") avec cache temps réel :
// les hooks gardent exactement la même API qu'à l'époque localStorage.

export const STAGES = [
  { name: "Nouveau", color: "rgb(59, 130, 246)" },
  { name: "À rappeler", color: "rgb(245, 158, 11)" },
  { name: "RDV pris", color: "rgb(16, 185, 129)" },
  { name: "Pré-qualifié", color: "rgb(99, 102, 241)" },
  { name: "Converti (contrat signé)", color: "rgb(34, 197, 94)" },
  { name: "Fermé", color: "rgb(107, 114, 128)" },
  { name: "Doublon", color: "rgb(239, 68, 68)" },
] as const;

export type StageName = (typeof STAGES)[number]["name"];

export const DEFAULT_CATEGORIES = [
  "Prospect",
  "Client",
  "Partenaire",
  "Fournisseur",
];

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  category: string;
  stage: StageName;
  notes: string;
  /** Date du dernier envoi du mail « nouveaux arrivants » depuis la fiche. */
  lastEmailSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

const store = createCollectionStore<Contact>("contacts");

/** Accès direct au store (migration, moteur d'automatisations). */
export const contactsStore = store;

function makeId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sorted(list: Contact[]): Contact[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function contactFullName(c: Pick<Contact, "firstName" | "lastName">) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

export function contactInitial(c: Contact) {
  return (contactFullName(c) || c.email || "?").charAt(0).toUpperCase();
}

// --- Événements CRM (consommés par le moteur d'automatisations) ---

export type CrmEvent =
  | { type: "contact_created"; contact: Contact }
  | { type: "stage_changed"; contact: Contact; from: StageName; to: StageName };

export function emitCrmEvent(event: CrmEvent) {
  window.dispatchEvent(new CustomEvent("netforce:crm-event", { detail: event }));
}

/** Conservé pour compatibilité : Firestore pousse déjà les mises à jour. */
export function requestDataRefresh() {
  window.dispatchEvent(new Event("netforce:data-refresh"));
}

/**
 * Modification directe d'un contact SANS émettre d'événement CRM —
 * réservé aux actions d'automatisation (évite les boucles infinies).
 */
export async function applyContactPatch(
  id: string,
  patch: Partial<ContactInput>,
): Promise<void> {
  await store.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>(sorted(store.get()));
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setContacts(sorted(store.get()));
        setLoading(false);
      }),
    [],
  );

  const addContact = useCallback(async (input: ContactInput): Promise<Contact> => {
    const now = new Date().toISOString();
    const contact: Contact = { ...input, id: makeId(), createdAt: now, updatedAt: now };
    await store.set(contact);
    emitCrmEvent({ type: "contact_created", contact });
    return contact;
  }, []);

  const updateContact = useCallback(
    async (id: string, input: Partial<ContactInput>): Promise<void> => {
      const before = store.get().find((c) => c.id === id);
      await store.update(id, { ...input, updatedAt: new Date().toISOString() });
      if (before && input.stage && input.stage !== before.stage) {
        emitCrmEvent({
          type: "stage_changed",
          contact: { ...before, ...input, stage: input.stage },
          from: before.stage,
          to: input.stage,
        });
      }
    },
    [],
  );

  const deleteContact = useCallback(async (id: string): Promise<void> => {
    await store.remove(id);
  }, []);

  /** Importe une liste de contacts en ignorant les emails déjà présents. */
  const importContacts = useCallback(
    async (inputs: ContactInput[]): Promise<{ added: number; skipped: number }> => {
      const knownEmails = new Set(
        store.get().map((c) => c.email.trim().toLowerCase()).filter(Boolean),
      );
      const now = new Date().toISOString();
      const toAdd: Contact[] = [];
      let skipped = 0;
      for (const input of inputs) {
        const email = input.email.trim().toLowerCase();
        if (email && knownEmails.has(email)) {
          skipped += 1;
          continue;
        }
        if (email) knownEmails.add(email);
        toAdd.push({ ...input, id: makeId(), createdAt: now, updatedAt: now });
      }
      await store.setMany(toAdd);
      for (const contact of toAdd) emitCrmEvent({ type: "contact_created", contact });
      return { added: toAdd.length, skipped };
    },
    [],
  );

  return { contacts, loading, addContact, updateContact, deleteContact, importContacts };
}
