"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  Bookmark,
  History,
  Mail,
  Plus,
  SquarePen,
  Tag,
  Trash2,
  UserPlus,
  Zap,
} from "lucide-react";
import { Action, Trigger, useAutomations } from "@/lib/automations";
import { applyContactPatch, contactFullName, useContacts } from "@/lib/contacts";
import {
  contactVariables,
  fillVariables,
  renderEmailText,
  useTemplates,
} from "@/lib/templates";

function actionChip(action: Action, templateName: (id: string) => string): string {
  switch (action.type) {
    case "send_email":
      return `Email : ${templateName(action.templateId)}`;
    case "create_task":
      return `Tâche : ${action.title} (J+${action.dueInDays})`;
    case "set_stage":
      return `Étape → ${action.stage}`;
    case "set_category":
      return `Catégorie → ${action.category}`;
  }
}

const ACTION_ICON: Record<Action["type"], typeof Mail> = {
  send_email: Mail,
  create_task: Bookmark,
  set_stage: ArrowRightLeft,
  set_category: Tag,
};

// Modèles d'automatisation prêts à l'emploi. Ajoutés DÉSACTIVÉS : c'est à
// l'utilisateur de les activer avec l'interrupteur. N'utilisent que des actions
// sans dépendance (tâches) pour fonctionner immédiatement, même sans template.
const PRESETS: { name: string; description: string; trigger: Trigger; actions: Action[] }[] = [
  {
    name: "Nouveau contact → tâche de qualification",
    description: "À chaque nouveau contact, crée une tâche de qualification à J+2.",
    trigger: { type: "contact_created", stage: "" },
    actions: [{ type: "create_task", title: "Qualifier le nouveau contact", dueInDays: 2 }],
  },
  {
    name: "RDV pris → préparer le rendez-vous",
    description: "Quand un contact passe en « RDV pris », crée une tâche de préparation le jour même.",
    trigger: { type: "stage_changed", stage: "RDV pris" },
    actions: [{ type: "create_task", title: "Préparer et confirmer le RDV", dueInDays: 0 }],
  },
  {
    name: "Pré-qualifié → envoyer la proposition",
    description: "Dès qu'un contact est « Pré-qualifié », crée une tâche « Envoyer la proposition » à J+1.",
    trigger: { type: "stage_changed", stage: "Pré-qualifié" },
    actions: [{ type: "create_task", title: "Envoyer la proposition commerciale", dueInDays: 1 }],
  },
  {
    name: "À rappeler → tâche de relance",
    description: "Quand un contact passe en « À rappeler », crée une tâche de relance à J+2.",
    trigger: { type: "stage_changed", stage: "À rappeler" },
    actions: [{ type: "create_task", title: "Rappeler ce contact", dueInDays: 2 }],
  },
  {
    name: "Contrat signé → lancer la livraison",
    description:
      "Quand un contact passe en « Converti (contrat signé) », crée une tâche de livraison / onboarding à J+1.",
    trigger: { type: "stage_changed", stage: "Converti (contrat signé)" },
    actions: [{ type: "create_task", title: "Lancer la livraison / onboarding", dueInDays: 1 }],
  },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AutomationsPage() {
  const { automations, log, queue, loading, addAutomation, updateAutomation, deleteAutomation, removeFromQueue } =
    useAutomations();
  const { contacts } = useContacts();
  const { templates } = useTemplates();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "template supprimé";
  const findContact = (id: string) => contacts.find((c) => c.id === id) ?? null;

  const sendQueued = (queueId: string, contactId: string, templateId: string) => {
    const contact = findContact(contactId);
    const template = templates.find((t) => t.id === templateId);
    if (!contact || !template || !contact.email) return;
    const vars = contactVariables(contact);
    const url =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(contact.email)}` +
      `&su=${encodeURIComponent(fillVariables(template.subject, vars).trim())}` +
      `&body=${encodeURIComponent(fillVariables(renderEmailText(template), vars))}`;
    window.open(url, "_blank");
    void applyContactPatch(contact.id, { lastEmailSentAt: new Date().toISOString() });
    void removeFromQueue(queueId);
  };

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">
              Automatisation — Scénarios
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Déclencheurs et actions exécutés automatiquement sur vos contacts
            </p>
          </div>
          <div className="shrink-0">
            <Link
              href="/automatisation/new"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle automatisation
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Scénarios */}
        {!loading && automations.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <Zap className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-foreground mt-3 text-sm font-semibold">Aucune automatisation</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Crée ton premier scénario : par exemple « à chaque nouveau contact, mettre le mail de
              bienvenue en file d&apos;attente et créer une tâche de rappel ».
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {automations.map((a) => {
              const TriggerIcon = a.trigger.type === "contact_created" ? UserPlus : ArrowRightLeft;
              return (
                <div
                  key={a.id}
                  className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-foreground truncate text-base font-bold">{a.name}</h3>
                      {a.description && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                          {a.description}
                        </p>
                      )}
                    </div>
                    {/* Interrupteur actif/inactif */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={a.active}
                      aria-label={a.active ? "Désactiver" : "Activer"}
                      onClick={() => void updateAutomation(a.id, { active: !a.active })}
                      className={
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                        (a.active ? "bg-emerald-500" : "bg-gray-300")
                      }
                    >
                      <span
                        className={
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
                          (a.active ? "translate-x-[22px]" : "translate-x-0.5")
                        }
                      />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      <TriggerIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {a.trigger.type === "contact_created"
                        ? "Nouveau contact"
                        : `Étape → ${a.trigger.stage || "toutes"}`}
                    </span>
                    {a.actions.map((action, i) => {
                      const Icon = ACTION_ICON[action.type];
                      return (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {actionChip(action, templateName)}
                        </span>
                      );
                    })}
                  </div>

                  <div className="border-border mt-4 flex items-center justify-between border-t pt-3">
                    <p className="text-muted-foreground text-xs">
                      {a.runs} exécution{a.runs > 1 ? "s" : ""}
                    </p>
                    <div className="flex gap-1">
                      <Link
                        href={`/automatisation/new?id=${a.id}`}
                        className="text-muted-foreground hover:bg-primary/15 hover:text-primary rounded-lg p-2 transition-colors"
                        title="Modifier"
                      >
                        <SquarePen className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      {confirmDeleteId === a.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            void deleteAutomation(a.id);
                          }}
                          onBlur={() => setConfirmDeleteId(null)}
                          className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                        >
                          Confirmer ?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(a.id)}
                          className="text-muted-foreground rounded-lg p-2 transition-colors hover:bg-red-50 hover:text-red-500"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modèles prêts à l'emploi */}
        <div>
          <h2 className="text-foreground mb-1 flex items-center gap-2 text-sm font-bold uppercase">
            <Zap className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            Modèles prêts à l&apos;emploi
          </h2>
          <p className="text-muted-foreground mb-3 text-xs">
            Ajoute-les d&apos;un clic — ils arrivent <strong>désactivés</strong>. À toi de les
            activer avec l&apos;interrupteur quand tu es prêt.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PRESETS.map((p) => {
              const already = automations.some((a) => a.name === p.name);
              const TriggerIcon = p.trigger.type === "contact_created" ? UserPlus : ArrowRightLeft;
              return (
                <div key={p.name} className="border-border bg-card rounded-2xl border p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-foreground text-base font-bold">{p.name}</h3>
                      <p className="text-muted-foreground mt-0.5 text-sm">{p.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => void addAutomation({ ...p, active: false })}
                      className={
                        "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
                        (already
                          ? "bg-muted text-muted-foreground cursor-default"
                          : "bg-primary text-primary-foreground hover:opacity-90")
                      }
                    >
                      {already ? "Ajouté" : "Ajouter"}
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      <TriggerIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {p.trigger.type === "contact_created"
                        ? "Nouveau contact"
                        : `Étape → ${p.trigger.stage || "toutes"}`}
                    </span>
                    {p.actions.map((action, i) => {
                      const Icon = ACTION_ICON[action.type];
                      return (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {actionChip(action, templateName)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* File d'attente d'emails */}
        {queue.length > 0 && (
          <div>
            <h2 className="text-foreground mb-3 flex items-center gap-2 text-sm font-bold uppercase">
              <Mail className="h-4 w-4 text-amber-500" aria-hidden="true" />
              File d&apos;attente d&apos;emails ({queue.length})
            </h2>
            <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-(--shadow-card)">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Contact</th>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Template</th>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Automatisation</th>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Ajouté le</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q) => {
                    const contact = findContact(q.contactId);
                    return (
                      <tr key={q.id} className="border-border border-t">
                        <td className="text-foreground px-4 py-3 font-semibold whitespace-nowrap">
                          {contact ? contactFullName(contact) || contact.email : "Contact supprimé"}
                        </td>
                        <td className="text-foreground px-4 py-3 whitespace-nowrap">
                          {templateName(q.templateId)}
                        </td>
                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                          {q.automationName}
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                          {formatDateTime(q.at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => sendQueued(q.id, q.contactId, q.templateId)}
                              disabled={!contact?.email}
                              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                            >
                              Envoyer via Gmail
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeFromQueue(q.id)}
                              className="text-muted-foreground hover:bg-muted rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors"
                            >
                              Retirer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              L&apos;envoi automatique (sans passer par Gmail) sera activé au branchement du compte
              Google.
            </p>
          </div>
        )}

        {/* Journal des exécutions */}
        {log.length > 0 && (
          <div>
            <h2 className="text-foreground mb-3 flex items-center gap-2 text-sm font-bold uppercase">
              <History className="h-4 w-4 text-gray-400" aria-hidden="true" />
              Journal des exécutions
            </h2>
            <div className="border-border bg-card divide-border divide-y rounded-xl border shadow-(--shadow-card)">
              {log.slice(0, 20).map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDateTime(entry.at)}
                  </span>
                  <span className="text-foreground text-sm font-semibold">{entry.automationName}</span>
                  <span className="text-muted-foreground text-sm">→ {entry.contactName}</span>
                  <span className="text-muted-foreground text-xs">{entry.summary.join(" · ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
