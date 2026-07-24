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
  /** Prêt = revient (démo) ; Envoi = sortie définitive (échantillon, commande…). */
  kind: "loan" | "shipment";
  type: GloveType;
  color: GloveColor;
  size: GloveSize;
  qty: number;
  loanedAt: string; // YYYY-MM-DD (date de sortie)
  dueAt: string; // YYYY-MM-DD — retour prévu (prêt uniquement)
  returnedAt: string; // "" tant que non rendu
  /** "out" = prêt en cours, "returned" = rendu, "sent" = envoi définitif. */
  status: "out" | "returned" | "sent";
  /** true si la sortie a décompté le stock (⇒ retour = réincrément). */
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
  return loan.kind === "loan" && loan.status === "out" && !!loan.dueAt && loan.dueAt < todayKey();
}

export function useLoans() {
  const [loans, setLoans] = useState<Loan[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        // Prêts en cours d'abord (par retour prévu), puis le reste (récent d'abord).
        setLoans(
          [...store.get()].sort((a, b) => {
            const rank = (l: Loan) => (l.status === "out" ? 0 : 1);
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            if (a.status === "out" && b.status === "out") {
              return (a.dueAt || "9999").localeCompare(b.dueAt || "9999");
            }
            return (b.loanedAt || "").localeCompare(a.loanedAt || "");
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
