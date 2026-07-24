"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  Building2,
  CalendarClock,
  CheckSquare,
  Clock,
  Globe,
  Handshake,
  Mail,
  Pencil,
  Phone,
  PhoneCall,
  Send,
  StickyNote,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  Contact,
  STAGES,
  contactFullName,
  contactInitial,
  dateKeyIn,
  followUpStatus,
} from "@/lib/contacts";
import {
  ACTIVITY_LABEL,
  ActivityType,
  MANUAL_ACTIVITY_TYPES,
  useContactActivities,
} from "@/lib/activities";
import { contactCountry, exportStatusMeta, useCompliance } from "@/lib/compliance";

const ACT_ICON: Record<ActivityType, typeof Mail> = {
  note: StickyNote,
  call: PhoneCall,
  email: Mail,
  meeting: CalendarClock,
  stage: ArrowRightLeft,
  loan: Handshake,
  task: CheckSquare,
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  contact: Contact | null;
  onClose: () => void;
  onEdit: (c: Contact) => void;
  onSendEmail: (c: Contact) => void;
  onSetFollowUp: (c: Contact, date: string | null) => void;
}

const FOLLOWUP_STYLES: Record<string, string> = {
  overdue: "border-red-200 bg-red-50 text-red-700",
  today: "border-amber-200 bg-amber-50 text-amber-700",
  upcoming: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function stageColor(name: string) {
  return STAGES.find((s) => s.name === name)?.color ?? "rgb(107, 114, 128)";
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ContactDetailModal({
  contact,
  onClose,
  onEdit,
  onSendEmail,
  onSetFollowUp,
}: Props) {
  const [actType, setActType] = useState<ActivityType>("note");
  const [actText, setActText] = useState("");
  const { activities, addActivity, deleteActivity } = useContactActivities(contact?.id ?? "");
  const { statusFor } = useCompliance();

  if (!contact) return null;
  const country = contactCountry(contact);
  const cMeta = exportStatusMeta(statusFor(country));
  const extraEntries = Object.entries(contact.extra ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const fuStatus = followUpStatus(contact);
  const fuLabel =
    fuStatus === "overdue" ? "En retard" : fuStatus === "today" ? "Aujourd'hui" : "Planifiée";

  const submitActivity = async () => {
    const text = actText.trim();
    if (!text) return;
    await addActivity(actType, text);
    setActText("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-start justify-between gap-3 border-b px-6 py-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
              {contactInitial(contact)}
            </div>
            <div className="min-w-0">
              <h2 className="text-foreground truncate text-lg font-bold">
                {contactFullName(contact) || contact.email}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: stageColor(contact.stage) }}
                  />
                  {contact.stage}
                </span>
                {contact.category && (
                  <span className="bg-muted text-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {contact.category}
                  </span>
                )}
                {(contact.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                  >
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted shrink-0 rounded p-1 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="text-foreground truncate">{contact.email || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="text-foreground truncate">{contact.phone || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm sm:col-span-2">
              <Building2 className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="text-foreground truncate">{contact.company || "—"}</span>
            </div>
            {country && (
              <div className="flex items-center gap-2 text-sm sm:col-span-2">
                <Globe className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="text-foreground">{country}</span>
                <span
                  className={"rounded-full border px-2 py-0.5 text-xs font-medium " + cMeta.badge}
                  title="Statut de conformité export (modifiable dans Conformité export)"
                >
                  {cMeta.label}
                </span>
              </div>
            )}
          </div>

          {/* Relance / prochaine action */}
          <div className="border-border rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Prochaine relance
              </p>
              {contact.nextFollowUpAt ? (
                <span
                  className={
                    "rounded-full border px-2 py-0.5 text-xs font-medium " +
                    (FOLLOWUP_STYLES[fuStatus ?? "upcoming"] ?? "")
                  }
                >
                  {fuLabel} · {formatDate(contact.nextFollowUpAt)}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">Aucune planifiée</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: "Aujourd'hui", days: 0 },
                { label: "+3 j", days: 3 },
                { label: "+7 j", days: 7 },
                { label: "+30 j", days: 30 },
              ].map((b) => (
                <button
                  key={b.days}
                  type="button"
                  onClick={() => onSetFollowUp(contact, dateKeyIn(b.days))}
                  className="border-border bg-card text-foreground hover:bg-muted rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                >
                  {b.label}
                </button>
              ))}
              {contact.nextFollowUpAt && (
                <button
                  type="button"
                  onClick={() => onSetFollowUp(contact, null)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          {contact.notes && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">Notes</p>
              <p className="text-foreground text-sm whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}

          {extraEntries.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                Toutes les informations importées
              </p>
              <div className="border-border overflow-hidden rounded-lg border">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {extraEntries.map(([key, value]) => (
                      <tr key={key} className="border-border border-t first:border-t-0">
                        <td className="bg-muted text-muted-foreground w-1/3 px-3 py-2 align-top text-xs font-medium">
                          {key}
                        </td>
                        <td className="text-foreground px-3 py-2 text-sm break-words">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Timeline d'activité */}
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">Activité</p>
            <div className="flex gap-2">
              <select
                value={actType}
                onChange={(e) => setActType(e.target.value as ActivityType)}
                className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2 py-2 text-sm focus:ring-2 focus:outline-none"
              >
                {MANUAL_ACTIVITY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                value={actText}
                onChange={(e) => setActText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitActivity();
                }}
                placeholder="Ajouter une note, un appel, un échange…"
                className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void submitActivity()}
                disabled={!actText.trim()}
                className="bg-primary text-primary-foreground shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Ajouter
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {activities.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Aucune activité pour le moment. Ajoute une note ou un appel ci-dessus.
                </p>
              ) : (
                activities.map((a) => {
                  const Icon = ACT_ICON[a.type];
                  return (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <span className="bg-muted mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                        <Icon className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-sm break-words">{a.text}</p>
                        <p className="text-muted-foreground text-[11px]">
                          {ACTIVITY_LABEL[a.type]} · {formatDateTime(a.at)}
                          {a.auto && " · auto"}
                        </p>
                      </div>
                      {!a.auto && (
                        <button
                          type="button"
                          onClick={() => void deleteActivity(a.id)}
                          className="hover:bg-muted shrink-0 rounded p-1"
                          aria-label="Supprimer cette activité"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>Créé le {formatDate(contact.createdAt)}</span>
            <span>Modifié le {formatDate(contact.updatedAt)}</span>
            {contact.lastEmailSentAt && (
              <span className="text-green-600">
                Mail nouveaux arrivants envoyé le {formatDate(contact.lastEmailSentAt)}
              </span>
            )}
          </div>
        </div>

        <div className="border-border flex justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={() => onSendEmail(contact)}
            disabled={!contact.email}
            className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Envoyer le mail
          </button>
          <button
            type="button"
            onClick={() => onEdit(contact)}
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Modifier
          </button>
        </div>
      </div>
    </div>
  );
}
