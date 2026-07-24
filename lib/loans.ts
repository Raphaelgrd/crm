"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";
import { todayKey } from "@/lib/contacts";
import { GloveColor, GloveSize, GloveType } from "@/lib/stock";

// Prêts / démos de G.I.E : un gant confié à un contact (unité de police,
// évaluateur…) pour test terrain, avec date de retour prévue et retour terrain.
// Branché sur le Stock : un prêt sort du stock, un retour y revient.

export interface Loan {
  id: string;
  contactId: string;
  contactName: string; // dénormalisé pour l'affichage
  company: string;
  type: GloveType;
  color: GloveColor;
  size: GloveSize;
  qty: number;
  loanedAt: string; // YYYY-MM-DD
  dueAt: string; // YYYY-MM-DD — retour prévu
  returnedAt: string; // "" tant que non rendu
  status: "out" | "returned";
  /** true si le prêt a décompté le stock (⇒ retour = réincrément). */
  stockLinked: boolean;
  feedback: string; // retour terrain, saisi au retour
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type LoanInput = Omit<Loan, "id" | "createdAt" | "updatedAt">;

const store = createCollectionStore<Loan>("loans");

/** Accès direct au store (migration). */
export const loansStore = store;

function makeId() {
  return `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Un prêt est en retard s'il est toujours sorti et que la date de retour est passée. */
export function loanOverdue(loan: Loan): boolean {
  return loan.status === "out" && !!loan.dueAt && loan.dueAt < todayKey();
}

export function useLoans() {
  const [loans, setLoans] = useState<Loan[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        // En prêt d'abord, puis par date de retour prévue.
        setLoans(
          [...store.get()].sort((a, b) => {
            if (a.status !== b.status) return a.status === "out" ? -1 : 1;
            return (a.dueAt || "9999").localeCompare(b.dueAt || "9999");
          }),
        );
        setLoading(false);
      }),
    [],
  );

  const addLoan = useCallback(async (input: LoanInput): Promise<Loan> => {
    const now = new Date().toISOString();
    const loan: Loan = { ...input, id: makeId(), createdAt: now, updatedAt: now };
    await store.set(loan);
    return loan;
  }, []);

  const updateLoan = useCallback(async (id: string, input: Partial<LoanInput>): Promise<void> => {
    await store.update(id, { ...input, updatedAt: new Date().toISOString() });
  }, []);

  const deleteLoan = useCallback(async (id: string): Promise<void> => {
    await store.remove(id);
  }, []);

  return { loans, loading, addLoan, updateLoan, deleteLoan };
}
