"use client";

import { Building2, Mail, Pencil, Phone, Send, Tag, X } from "lucide-react";
import { Contact, STAGES, contactFullName, contactInitial } from "@/lib/contacts";

interface Props {
  contact: Contact | null;
  onClose: () => void;
  onEdit: (c: Contact) => void;
  onSendEmail: (c: Contact) => void;
}

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

export default function ContactDetailModal({ contact, onClose, onEdit, onSendEmail }: Props) {
  if (!contact) return null;
  const extraEntries = Object.entries(contact.extra ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

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
