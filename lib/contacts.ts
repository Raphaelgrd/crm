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
  /** Date de la prochaine relance (YYYY-MM-DD) — pilote le tableau des relances. */
  nextFollowUpAt?: string;
  /** Rattachement explicite à une fiche Organisation (sinon regroupé par société). */
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

// --- Segments dynamiques façon Brevo ---
// Un segment = des groupes de conditions. Dans un groupe, les conditions sont
// reliées par ET ; les groupes entre eux sont reliés par OU. La composition se
// recalcule en direct : tout contact qui remplit les conditions y apparaît.

export type SegmentOperator =
  | "eq" // est égal à
  | "neq" // est différent de
  | "contains" // contient
  | "not_contains" // ne contient pas
  | "starts_with" // commence par
  | "is_set" // contient une valeur (non vide)
  | "is_empty"; // est vide

export const SEGMENT_OPERATORS: {
  id: SegmentOperator;
  label: string;
  needsValue: boolean;
}[] = [
  { id: "eq", label: "est égal à", needsValue: true },
  { id: "neq", label: "est différent de", needsValue: true },
  { id: "contains", label: "contient", needsValue: true },
  { id: "not_contains", label: "ne contient pas", needsValue: true },
  { id: "starts_with", label: "commence par", needsValue: true },
  { id: "is_set", label: "contient une valeur", needsValue: false },
  { id: "is_empty", label: "est vide", needsValue: false },
];

/** Champs de base filtrables ; le reste vient des colonnes importées (extra:*). */
export const SEGMENT_BASE_FIELDS: { id: string; label: string }[] = [
  { id: "name", label: "Nom complet" },
  { id: "firstName", label: "Prénom" },
  { id: "lastName", label: "Nom" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Téléphone" },
  { id: "company", label: "Société" },
  { id: "category", label: "Catégorie" },
  { id: "stage", label: "Étape" },
  { id: "tags", label: "Tags" },
];

export interface SegmentCondition {
  field: string; // id d'un SEGMENT_BASE_FIELDS ou "extra:<clé>"
  operator: SegmentOperator;
  value: string;
}

export interface SegmentGroup {
  conditions: SegmentCondition[]; // reliées par ET
}

export interface Segment {
  id: string;
  name: string;
  groups: SegmentGroup[]; // reliés par OU
  createdAt: string;
  updatedAt: string;
}

export function segmentFieldLabel(field: string): string {
  if (field.startsWith("extra:")) return field.slice(6);
  return SEGMENT_BASE_FIELDS.find((f) => f.id === field)?.label ?? field;
}

/** Valeur texte d'un champ pour un contact (pour filtrage et affichage). */
export function contactFieldValue(c: Contact, field: string): string {
  switch (field) {
    case "name":
      return contactFullName(c);
    case "firstName":
      return c.firstName ?? "";
    case "lastName":
      return c.lastName ?? "";
    case "email":
      return c.email ?? "";
    case "phone":
      return c.phone ?? "";
    case "company":
      return c.company ?? "";
    case "category":
      return c.category ?? "";
    case "stage":
      return c.stage ?? "";
    case "tags":
      return (c.tags ?? []).join(" ");
    default:
      return field.startsWith("extra:") ? (c.extra?.[field.slice(6)] ?? "") : "";
  }
}

function matchCondition(c: Contact, cond: SegmentCondition): boolean {
  const raw = contactFieldValue(c, cond.field);
  const hay = raw.trim().toLowerCase();
  const needle = (cond.value ?? "").trim().toLowerCase();
  const isTag = cond.field === "tags";
  switch (cond.operator) {
    case "is_set":
      return hay !== "";
    case "is_empty":
      return hay === "";
    case "eq":
      return isTag
        ? (c.tags ?? []).some((t) => t.toLowerCase() === needle)
        : hay === needle;
    case "neq":
      return isTag
        ? !(c.tags ?? []).some((t) => t.toLowerCase() === needle)
        : hay !== needle;
    case "contains":
      return needle === "" || hay.includes(needle);
    case "not_contains":
      return needle === "" || !hay.includes(needle);
    case "starts_with":
      return hay.startsWith(needle);
    default:
      return true;
  }
}

/** Un contact appartient au segment (OU entre groupes, ET dans un groupe). */
export function contactMatchesSegment(c: Contact, seg: Pick<Segment, "groups">): boolean {
  const groups = (seg.groups ?? []).filter((g) => g.conditions.length > 0);
  if (groups.length === 0) return true;
  return groups.some((g) => g.conditions.every((cond) => matchCondition(c, cond)));
}

/** Nombre de contacts d'un segment (pour l'affichage du compteur en direct). */
export function segmentCount(contacts: Contact[], seg: Pick<Segment, "groups">): number {
  return contacts.reduce((n, c) => (contactMatchesSegment(c, seg) ? n + 1 : n), 0);
}

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

// --- Relances (suivi des follow-ups) ---

/** Clé de date dans `days` jours (négatif = passé), au format YYYY-MM-DD. */
export function dateKeyIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Clé de date du jour (YYYY-MM-DD). */
export function todayKey(): string {
  return dateKeyIn(0);
}

export type FollowUpStatus = "overdue" | "today" | "upcoming";

/** Statut de relance d'un contact (null si aucune relance planifiée). */
export function followUpStatus(c: Pick<Contact, "nextFollowUpAt">): FollowUpStatus | null {
  if (!c.nextFollowUpAt) return null;
  const today = todayKey();
  if (c.nextFollowUpAt < today) return "overdue";
  if (c.nextFollowUpAt === today) return "today";
  return "upcoming";
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

const segmentsStore = createCollectionStore<Segment>("segments");

function normalizeSegment(s: Segment): Segment {
  // Tolère les anciens segments (modèle « filtre simple ») : groups garanti.
  return { ...s, groups: Array.isArray(s.groups) ? s.groups : [] };
}

export function useSegments() {
  const [segments, setSegments] = useState<Segment[]>(() =>
    segmentsStore.get().map(normalizeSegment),
  );

  useEffect(
    () =>
      segmentsStore.subscribe(() =>
        setSegments(
          segmentsStore
            .get()
            .map(normalizeSegment)
            .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
        ),
      ),
    [],
  );

  const saveSegment = useCallback(
    async (input: { id?: string; name: string; groups: SegmentGroup[] }): Promise<Segment> => {
      const now = new Date().toISOString();
      const existing = input.id
        ? segmentsStore.get().find((s) => s.id === input.id)
        : undefined;
      const segment: Segment = {
        id:
          input.id ??
          `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: input.name,
        groups: input.groups,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await segmentsStore.set(segment);
      return segment;
    },
    [],
  );

  const deleteSegment = useCallback(async (id: string): Promise<void> => {
    await segmentsStore.remove(id);
  }, []);

  return { segments, saveSegment, deleteSegment };
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
