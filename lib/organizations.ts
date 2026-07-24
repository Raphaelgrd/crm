"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";
import { Contact, StageName } from "@/lib/contacts";

// Comptes / Organisations. Modèle « les deux » :
// - regroupement AUTO des contacts par nom de société (aucune saisie) ;
// - fiches Organisation DÉDIÉES quand on veut structurer un compte important
//   (type, pays, étape compte, notes), avec rattachement explicite des contacts.

/** Types d'organisation adaptés au secteur défense / institutionnel. */
export const ORG_TYPES = [
  "Ministère / Institution",
  "Police",
  "Gendarmerie",
  "Armée / Défense",
  "Sécurité privée",
  "Distributeur / Revendeur",
  "Entreprise",
  "Autre",
];

export interface Organization {
  id: string;
  name: string;
  type: string;
  country: string;
  /** Étape pipeline au niveau du compte (réutilise les étapes contacts). */
  stage: StageName | "";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationInput = Omit<Organization, "id" | "createdAt" | "updatedAt">;

const store = createCollectionStore<Organization>("organizations");

/** Accès direct au store (migration). */
export const organizationsStore = store;

function makeId() {
  return `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setOrganizations(
          [...store.get()].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setLoading(false);
      }),
    [],
  );

  const addOrganization = useCallback(async (input: OrganizationInput): Promise<Organization> => {
    const now = new Date().toISOString();
    const org: Organization = { ...input, id: makeId(), createdAt: now, updatedAt: now };
    await store.set(org);
    return org;
  }, []);

  const updateOrganization = useCallback(
    async (id: string, input: Partial<OrganizationInput>): Promise<void> => {
      await store.update(id, { ...input, updatedAt: new Date().toISOString() });
    },
    [],
  );

  const deleteOrganization = useCallback(async (id: string): Promise<void> => {
    await store.remove(id);
  }, []);

  return { organizations, loading, addOrganization, updateOrganization, deleteOrganization };
}

// --- Regroupement en « comptes » (fiches + groupes auto) ---

export interface Account {
  /** id de la fiche Organisation, ou `auto:<société>` pour un groupe auto. */
  id: string;
  name: string;
  type: string;
  country: string;
  stage: StageName | "";
  /** true = vraie fiche Organisation ; false = groupe auto par société. */
  isRecord: boolean;
  orgId?: string;
  contacts: Contact[];
}

/**
 * Fusionne fiches Organisation et regroupement auto par société en une liste
 * de comptes. Un contact est rattaché : (1) à son organizationId s'il en a un,
 * (2) sinon à la fiche dont le nom == sa société, (3) sinon à un groupe auto.
 */
export function buildAccounts(contacts: Contact[], orgs: Organization[]): Account[] {
  const byId = new Map<string, Organization>();
  const byName = new Map<string, Organization>();
  for (const o of orgs) {
    byId.set(o.id, o);
    if (o.name.trim()) byName.set(o.name.trim().toLowerCase(), o);
  }

  const accounts = new Map<string, Account>();
  const fromOrg = (o: Organization): Account => {
    let a = accounts.get(o.id);
    if (!a) {
      a = {
        id: o.id,
        name: o.name,
        type: o.type,
        country: o.country,
        stage: o.stage,
        isRecord: true,
        orgId: o.id,
        contacts: [],
      };
      accounts.set(o.id, a);
    }
    return a;
  };

  // Toujours inclure les fiches, même sans contact rattaché.
  for (const o of orgs) fromOrg(o);

  for (const c of contacts) {
    let org: Organization | undefined;
    if (c.organizationId) org = byId.get(c.organizationId);
    if (!org && c.company.trim()) org = byName.get(c.company.trim().toLowerCase());
    if (org) {
      fromOrg(org).contacts.push(c);
      continue;
    }
    const company = c.company.trim();
    if (!company) continue; // contacts sans société : non regroupés
    const key = `auto:${company.toLowerCase()}`;
    let a = accounts.get(key);
    if (!a) {
      a = { id: key, name: company, type: "", country: "", stage: "", isRecord: false, contacts: [] };
      accounts.set(key, a);
    }
    a.contacts.push(c);
  }

  return Array.from(accounts.values()).sort(
    (a, b) => b.contacts.length - a.contacts.length || a.name.localeCompare(b.name),
  );
}
