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
  /** Tags libres, cumulables (segments façon Brevo : « Institutionnel », « Espagne »…). */
  tags?: string[];
  /** Toutes les colonnes CSV non mappées : rien n'est perdu à l'import. */
  extra?: Record<string, string>;
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

  /**
   * Importe une liste de contacts. Un email déjà présent est soit ignoré,
   * soit complété (updateExisting) : champs vides remplis, tags fusionnés,
   * colonnes extra ajoutées — jamais de doublon.
   */
  const importContacts = useCallback(
    async (
      inputs: ContactInput[],
      options: { updateExisting?: boolean } = {},
    ): Promise<{ added: number; updated: number; skipped: number }> => {
      const byEmail = new Map<string, Contact>();
      for (const c of store.get()) {
        const email = c.email.trim().toLowerCase();
        if (email) byEmail.set(email, c);
      }
      const now = new Date().toISOString();
      const toWrite: Contact[] = [];
      const created: Contact[] = [];
      let updated = 0;
      let skipped = 0;
      for (const input of inputs) {
        const email = input.email.trim().toLowerCase();
        const existing = email ? byEmail.get(email) : undefined;
        if (existing) {
          if (!options.updateExisting) {
            skipped += 1;
            continue;
          }
          const merged: Contact = {
            ...existing,
            firstName: existing.firstName || input.firstName,
            lastName: existing.lastName || input.lastName,
            phone: existing.phone || input.phone,
            company: existing.company || input.company,
            category: existing.category || input.category,
            notes: existing.notes || input.notes,
            tags: Array.from(new Set([...(existing.tags ?? []), ...(input.tags ?? [])])),
            extra: { ...(existing.extra ?? {}), ...(input.extra ?? {}) },
            updatedAt: now,
          };
          byEmail.set(email, merged);
          toWrite.push(merged);
          updated += 1;
          continue;
        }
        const contact: Contact = { ...input, id: makeId(), createdAt: now, updatedAt: now };
        if (email) byEmail.set(email, contact);
        toWrite.push(contact);
        created.push(contact);
      }
      await store.setMany(toWrite);
      for (const contact of created) emitCrmEvent({ type: "contact_created", contact });
      return { added: created.length, updated, skipped };
    },
    [],
  );

  return { contacts, loading, addContact, updateContact, deleteContact, importContacts };
}
