"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { subscribeSyncErrors, syncErrorsSnapshot } from "@/lib/firebase";

// Bandeau discret quand la synchronisation avec la base est coupée depuis plus de 10 secondes :
// les données affichées peuvent alors être en retard. Les écoutes se relancent toutes seules.

export default function SyncBanner() {
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeSyncErrors(() => setErrors(syncErrorsSnapshot())), []);

  useEffect(() => {
    if (!errors.size) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 10_000);
    return () => clearTimeout(t);
  }, [errors]);

  if (!visible || !errors.size) return null;
  const code = [...errors.values()][0];
  return (
    <div role="status" className="flex items-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <RefreshCw className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Synchronisation avec la base interrompue ({code}) : les données affichées peuvent être en retard. Nouvelle
        tentative automatique…
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-amber-100"
      >
        Recharger
      </button>
    </div>
  );
}
