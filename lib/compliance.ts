"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";
import { Contact } from "@/lib/contacts";

// Suivi de conformité export PILOTÉ PAR L'UTILISATEUR. Le G.I.E étant une arme
// non-létale, l'export vers certains pays demande une licence / peut être
// restreint. Ici on NE code AUCUNE liste d'embargo en dur : c'est l'utilisateur
// qui classe chaque pays. Indicatif — ne remplace pas une autorisation officielle.

export type ExportStatus = "ok" | "license" | "restricted" | "unknown";

export const EXPORT_STATUSES: {
  id: ExportStatus;
  label: string;
  badge: string;
  dot: string;
}[] = [
  { id: "ok", label: "Autorisé", badge: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  { id: "license", label: "Licence requise", badge: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  { id: "restricted", label: "Restreint / embargo", badge: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
  { id: "unknown", label: "À évaluer", badge: "border-gray-200 bg-gray-50 text-gray-600", dot: "bg-gray-400" },
];

export function exportStatusMeta(id: ExportStatus) {
  return EXPORT_STATUSES.find((s) => s.id === id) ?? EXPORT_STATUSES[3];
}

/** Pays d'un contact : champ dédié, sinon colonne importée « Pays »/« Country ». */
export function contactCountry(c: Contact): string {
  if (c.country && c.country.trim()) return c.country.trim();
  const extra = c.extra ?? {};
  for (const k of Object.keys(extra)) {
    const kl = k.toLowerCase();
    if ((kl === "pays" || kl === "country" || kl === "país") && extra[k]?.trim()) {
      return extra[k].trim();
    }
  }
  return "";
}

function slug(country: string) {
  return country.trim().toLowerCase();
}

export interface CountryRule {
  id: string; // slug du pays
  country: string;
  status: ExportStatus;
  notes: string;
  updatedAt: string;
}

const store = createCollectionStore<CountryRule>("countryCompliance");

/** Accès direct au store (migration). */
export const complianceStore = store;

export function useCompliance() {
  const [rules, setRules] = useState<CountryRule[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setRules(store.get());
        setLoading(false);
      }),
    [],
  );

  const ruleFor = useCallback(
    (country: string): CountryRule | undefined =>
      country ? store.get().find((r) => r.id === slug(country)) : undefined,
    [rules], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const statusFor = useCallback(
    (country: string): ExportStatus => ruleFor(country)?.status ?? "unknown",
    [ruleFor],
  );

  const setCountry = useCallback(
    async (country: string, patch: { status?: ExportStatus; notes?: string }): Promise<void> => {
      const id = slug(country);
      const existing = store.get().find((r) => r.id === id);
      await store.set({
        id,
        country: country.trim(),
        status: patch.status ?? existing?.status ?? "unknown",
        notes: patch.notes ?? existing?.notes ?? "",
        updatedAt: new Date().toISOString(),
      });
    },
    [],
  );

  return { rules, loading, ruleFor, statusFor, setCountry };
}
