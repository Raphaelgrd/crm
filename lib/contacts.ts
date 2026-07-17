"use client";

import { useCallback, useEffect, useState } from "react";

// ⚠️ Couche de données locale (localStorage) en attendant les clés Firebase.
// L'API (async CRUD) est calquée sur Firestore : pour brancher Firebase,
// seules les fonctions load/save/persist de ce fichier changent — aucune
// modification côté pages/composants.

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

const STORAGE_KEY = "netforce.contacts";

function load(): Contact[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Contact[]) : [];
  } catch {
    return [];
  }
}

function save(list: Contact[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function makeId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function contactFullName(c: Pick<Contact, "firstName" | "lastName">) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

export function contactInitial(c: Contact) {
  return (contactFullName(c) || c.email || "?").charAt(0).toUpperCase();
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setContacts(load());
    setLoading(false);
  }, []);

  const persist = useCallback((next: Contact[]) => {
    setContacts(next);
    save(next);
  }, []);

  const addContact = useCallback(
    async (input: ContactInput): Promise<Contact> => {
      const now = new Date().toISOString();
      const contact: Contact = { ...input, id: makeId(), createdAt: now, updatedAt: now };
      persist([contact, ...load()]);
      return contact;
    },
    [persist],
  );

  const updateContact = useCallback(
    async (id: string, input: Partial<ContactInput>): Promise<void> => {
      const next = load().map((c) =>
        c.id === id ? { ...c, ...input, updatedAt: new Date().toISOString() } : c,
      );
      persist(next);
    },
    [persist],
  );

  const deleteContact = useCallback(
    async (id: string): Promise<void> => {
      persist(load().filter((c) => c.id !== id));
    },
    [persist],
  );

  /** Importe une liste de contacts en ignorant les emails déjà présents. */
  const importContacts = useCallback(
    async (inputs: ContactInput[]): Promise<{ added: number; skipped: number }> => {
      const existing = load();
      const knownEmails = new Set(
        existing.map((c) => c.email.trim().toLowerCase()).filter(Boolean),
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
      persist([...toAdd, ...existing]);
      return { added: toAdd.length, skipped };
    },
    [persist],
  );

  return { contacts, loading, addContact, updateContact, deleteContact, importContacts };
}
