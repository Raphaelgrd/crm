"use client";

import { useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

// Demandes de signature Yousign (NDA, MOU…). Écrites par le serveur, lues ici.

export interface SignatureSigner {
  name: string;
  email: string;
  status: string;
}

export interface SignatureRequest {
  id: string;
  yousignId: string;
  env: "sandbox" | "production";
  docType: string;
  title: string;
  contactId: string;
  contactName: string;
  company: string;
  signers: SignatureSigner[];
  status: string;
  sentBy: string;
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
}

export const SIGNATURE_STATUS: Record<string, { label: string; tone: "wait" | "ok" | "ko" | "neutral" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  approval: { label: "En validation", tone: "wait" },
  ongoing: { label: "En attente de signature", tone: "wait" },
  done: { label: "Signé", tone: "ok" },
  expired: { label: "Expiré", tone: "ko" },
  canceled: { label: "Annulé", tone: "neutral" },
  declined: { label: "Refusé", tone: "ko" },
  rejected: { label: "Rejeté", tone: "ko" },
  deleted: { label: "Supprimé", tone: "neutral" },
};

export const SIGNER_STATUS: Record<string, string> = {
  initiated: "Pas encore reçu",
  notified: "Email reçu",
  verified: "En cours",
  processing: "En cours",
  consent_given: "En cours",
  signed: "A signé",
  declined: "A refusé",
  aborted: "Annulé",
  error: "Erreur",
};

const store = createCollectionStore<SignatureRequest>("signatures");

export function useSignatures() {
  const [items, setItems] = useState<SignatureRequest[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());
  useEffect(
    () =>
      store.subscribe(() => {
        setItems([...store.get()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setLoading(false);
      }),
    [],
  );
  return { signatures: items, loading };
}
