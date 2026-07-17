"use client";

import { useEffect, useState } from "react";
import { CloudUpload, X } from "lucide-react";
import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Contact, contactsStore } from "@/lib/contacts";
import { EmailTemplate, WELCOME_TEMPLATE_ID, templatesStore } from "@/lib/templates";
import { AgendaEvent, agendaStore } from "@/lib/agenda";
import { Automation, ExecutionLog, QueuedEmail, automationStores } from "@/lib/automations";

// Propose (une seule fois) de pousser les données de l'ère localStorage vers
// Firestore. Les données locales sont conservées en secours après migration.

const MIGRATED_FLAG = "netforce.migrated";

function readLocal<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export default function MigrationBanner() {
  const [visible, setVisible] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [localCount, setLocalCount] = useState(0);

  useEffect(() => {
    if (window.localStorage.getItem(MIGRATED_FLAG)) return;
    const locals = readLocal<Contact>("netforce.contacts");
    if (locals.length === 0) {
      window.localStorage.setItem(MIGRATED_FLAG, "empty");
      return;
    }
    setLocalCount(locals.length);
    // Vérification CÔTÉ SERVEUR (le cache optimiste du SDK peut mentir si les
    // règles Firestore rejettent les écritures).
    getCountFromServer(collection(db, "contacts"))
      .then((snap) => {
        if (snap.data().count > 0) {
          window.localStorage.setItem(MIGRATED_FLAG, "cloud-not-empty");
        } else {
          setVisible(true);
        }
      })
      .catch(() => {
        // Règles fermées ou hors-ligne : on ne décide rien, on réessaiera.
      });
  }, []);

  const migrate = async () => {
    setMigrating(true);
    try {
      const contacts = readLocal<Contact>("netforce.contacts");
      const templates = readLocal<EmailTemplate>("netforce.templates");
      const agenda = readLocal<AgendaEvent>("netforce.agenda");
      const automations = readLocal<Automation>("netforce.automations");
      const log = readLocal<ExecutionLog>("netforce.automations.log");
      const queue = readLocal<QueuedEmail>("netforce.emailqueue");

      // Le mail « nouveaux arrivants » prend l'id fixe "welcome" dans le cloud.
      const oldWelcomeId = templates.find((t) => t.special === "welcome")?.id;
      const migratedTemplates = templates.map((t) =>
        t.special === "welcome" ? { ...t, id: WELCOME_TEMPLATE_ID } : t,
      );
      const migratedAutomations = automations.map((a) => ({
        ...a,
        actions: a.actions.map((action) =>
          action.type === "send_email" && action.templateId === oldWelcomeId
            ? { ...action, templateId: WELCOME_TEMPLATE_ID }
            : action,
        ),
      }));

      await contactsStore.setMany(contacts);
      await templatesStore.setMany(migratedTemplates);
      await agendaStore.setMany(agenda);
      await automationStores.automations.setMany(migratedAutomations);
      await automationStores.log.setMany(log);
      await automationStores.queue.setMany(queue);

      window.localStorage.setItem(MIGRATED_FLAG, new Date().toISOString());
      setDone(
        `${contacts.length} contacts, ${migratedTemplates.length} templates, ` +
          `${agenda.length} événements et ${migratedAutomations.length} automatisations migrés ✓`,
      );
    } catch (err) {
      setDone(`Erreur pendant la migration : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMigrating(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-full max-w-md rounded-2xl border border-blue-200 bg-white p-5 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
          <CloudUpload className="h-5 w-5 text-blue-600" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            {done ? "Migration terminée" : "Migrer tes données vers le cloud"}
          </p>
          {done ? (
            <p className="mt-1 text-sm text-gray-600">{done}</p>
          ) : (
            <p className="mt-1 text-sm text-gray-600">
              {localCount} contacts (+ templates, agenda, automatisations) sont stockés dans ce
              navigateur. Pousse-les vers Firebase pour les retrouver partout.
            </p>
          )}
          {!done && (
            <button
              type="button"
              onClick={() => void migrate()}
              disabled={migrating}
              className="bg-primary text-primary-foreground mt-3 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {migrating ? "Migration en cours…" : "Migrer maintenant"}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded p-1 transition-colors hover:bg-gray-100"
          aria-label="Fermer"
        >
          <X className="h-4 w-4 text-gray-400" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
