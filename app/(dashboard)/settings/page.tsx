"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  Database,
  Download,
  Globe,
  Mail,
  ShieldAlert,
  Video,
} from "lucide-react";
import { collection, deleteDoc, doc, getCountFromServer, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Page Paramètres / Admin du CRM : état des données, sauvegarde JSON,
// intégrations, zone de danger. (La gestion des utilisateurs viendra avec
// Firebase Auth ; celle du Rapport d'activité est dans /rapport → Paramètres.)

const COLLECTIONS: { id: string; label: string }[] = [
  { id: "contacts", label: "Contacts" },
  { id: "segments", label: "Listes / segments" },
  { id: "templates", label: "Templates" },
  { id: "agenda", label: "Agenda" },
  { id: "automations", label: "Automatisations" },
  { id: "emailQueue", label: "File d'attente emails" },
  { id: "automationLog", label: "Journal automatisations" },
  { id: "stock", label: "Stock (références)" },
  { id: "stockMovements", label: "Stock (mouvements)" },
];

interface Integration {
  icon: typeof Cloud;
  name: string;
  detail: string;
  status: "ok" | "todo";
}

const INTEGRATIONS: Integration[] = [
  { icon: Cloud, name: "Firebase — CRM", detail: "Projet crm-netforce · Firestore temps réel", status: "ok" },
  { icon: Cloud, name: "Firebase — Rapport d'activité", detail: "Projet netforce-38edf · Auth + Firestore", status: "ok" },
  { icon: Mail, name: "Google OAuth (Gmail)", detail: "Envoi direct des emails — à brancher", status: "todo" },
  { icon: Video, name: "Google Meet", detail: "Liens visio sur les RDV — à brancher", status: "todo" },
  { icon: Globe, name: "Hébergement IONOS", detail: "Déploiement de l'appli — à venir", status: "todo" },
];

export default function SettingsPage() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [exporting, setExporting] = useState(false);
  const [purging, setPurging] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    for (const c of COLLECTIONS) {
      getCountFromServer(collection(db, c.id))
        .then((snap) => setCounts((prev) => ({ ...prev, [c.id]: snap.data().count })))
        .catch(() => setCounts((prev) => ({ ...prev, [c.id]: null })));
    }
  }, []);

  const exportBackup = async () => {
    setExporting(true);
    try {
      const backup: Record<string, unknown[]> = {};
      for (const c of COLLECTIONS) {
        const snap = await getDocs(collection(db, c.id));
        backup[c.id] = snap.docs.map((d) => d.data());
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `netforce-crm-sauvegarde-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setMessage("Sauvegarde téléchargée ✓");
    } catch {
      setMessage("Erreur pendant l'export.");
    } finally {
      setExporting(false);
      setTimeout(() => setMessage(""), 4000);
    }
  };

  const purgeCollection = async (id: string) => {
    setPurging(id);
    try {
      const snap = await getDocs(collection(db, id));
      for (const d of snap.docs) await deleteDoc(doc(db, id, d.id));
      setCounts((prev) => ({ ...prev, [id]: 0 }));
      setMessage("Vidé ✓");
    } catch {
      setMessage("Erreur pendant la purge.");
    } finally {
      setPurging(null);
      setTimeout(() => setMessage(""), 4000);
    }
  };

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <h1 className="text-foreground text-xl font-bold sm:text-2xl">Paramètres</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Données, sauvegardes et intégrations du CRM
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
        {message && (
          <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
            {message}
          </p>
        )}

        {/* Données */}
        <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-foreground flex items-center gap-2 text-base font-bold">
              <Database className="h-4 w-4 text-gray-400" aria-hidden="true" />
              Données (Firestore)
            </h2>
            <button
              type="button"
              onClick={() => void exportBackup()}
              disabled={exporting}
              className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {exporting ? "Export…" : "Sauvegarde JSON"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COLLECTIONS.map((c) => (
              <div key={c.id} className="border-border bg-muted/40 rounded-lg border px-3 py-2">
                <p className="text-foreground text-lg font-bold">
                  {counts[c.id] === undefined ? "…" : counts[c.id] === null ? "—" : counts[c.id]}
                </p>
                <p className="text-muted-foreground text-[10px] font-semibold uppercase">
                  {c.label}
                </p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            La sauvegarde JSON contient toutes les collections ci-dessus — garde-la précieusement
            avant toute grosse manipulation. (La Data Room est stockée localement dans ce
            navigateur, elle n&apos;est pas incluse.)
          </p>
        </div>

        {/* Intégrations */}
        <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
          <h2 className="text-foreground mb-4 flex items-center gap-2 text-base font-bold">
            <Cloud className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Intégrations
          </h2>
          <div className="space-y-2">
            {INTEGRATIONS.map((i) => (
              <div key={i.name} className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5">
                <i.icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">{i.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{i.detail}</p>
                </div>
                <span
                  className={
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase " +
                    (i.status === "ok"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700")
                  }
                >
                  {i.status === "ok" ? "Connecté" : "À venir"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Zone de danger */}
        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-red-700">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Zone de danger
          </h2>
          <p className="text-muted-foreground mb-4 text-xs">
            Actions irréversibles — fais une sauvegarde JSON avant.
          </p>
          <div className="space-y-2">
            {["emailQueue", "automationLog"].map((id) => {
              const label = COLLECTIONS.find((c) => c.id === id)?.label ?? id;
              return (
                <div key={id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5">
                  <p className="text-foreground text-sm font-medium">Vider « {label} »</p>
                  {confirmPurge === id ? (
                    <button
                      type="button"
                      disabled={purging === id}
                      onClick={() => {
                        setConfirmPurge(null);
                        void purgeCollection(id);
                      }}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      Confirmer ?
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={purging !== null}
                      onClick={() => setConfirmPurge(id)}
                      onBlur={() => setConfirmPurge(null)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {purging === id ? "Purge…" : "Vider"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
