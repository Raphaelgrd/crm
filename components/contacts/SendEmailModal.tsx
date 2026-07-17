"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Mail, Pencil, X } from "lucide-react";
import { Contact, contactFullName } from "@/lib/contacts";
import {
  contactVariables,
  fillVariables,
  renderEmailHtml,
  renderEmailText,
  useTemplates,
} from "@/lib/templates";

interface Props {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  /** Appelé quand l'utilisateur déclenche un envoi (Gmail / app mail). */
  onSent: (contact: Contact) => Promise<void>;
}

export default function SendEmailModal({ open, contact, onClose, onSent }: Props) {
  const { templates, loading } = useTemplates();
  const [copied, setCopied] = useState(false);

  const template = useMemo(
    () => templates.find((t) => t.special === "welcome") ?? null,
    [templates],
  );

  const filled = useMemo(() => {
    if (!template || !contact) return null;
    const vars = contactVariables(contact);
    return {
      subject: fillVariables(template.subject, vars).trim(),
      html: fillVariables(renderEmailHtml(template), vars),
      text: fillVariables(renderEmailText(template), vars),
    };
  }, [template, contact]);

  if (!open || !contact) return null;

  const markSent = () => void onSent(contact);

  const openGmail = () => {
    if (!filled) return;
    const url =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(contact.email)}` +
      `&su=${encodeURIComponent(filled.subject)}` +
      `&body=${encodeURIComponent(filled.text)}`;
    window.open(url, "_blank");
    markSent();
  };

  const openMailApp = () => {
    if (!filled) return;
    window.location.href =
      `mailto:${encodeURIComponent(contact.email)}` +
      `?subject=${encodeURIComponent(filled.subject)}` +
      `&body=${encodeURIComponent(filled.text)}`;
    markSent();
  };

  const copyHtml = async () => {
    if (!filled) return;
    await navigator.clipboard.writeText(filled.html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-foreground text-lg font-bold">Mail nouveaux arrivants</h2>
            <p className="text-muted-foreground truncate text-sm">
              À : <span className="font-semibold">{contactFullName(contact) || contact.email}</span>
              {contact.email ? ` — ${contact.email}` : ""}
              {contact.lastEmailSentAt && (
                <span className="ml-2 text-green-600">
                  ✓ déjà envoyé le{" "}
                  {new Date(contact.lastEmailSentAt).toLocaleDateString("fr-FR")}
                </span>
              )}
            </p>
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

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? null : !template || !filled ? (
            <p className="text-muted-foreground p-6 text-sm">
              Aucun mail « nouveaux arrivants » trouvé — recharge la page Templates pour le créer.
            </p>
          ) : (
            <div className="flex h-full flex-col">
              <div className="bg-muted border-border shrink-0 border-b px-6 py-2">
                <p className="text-muted-foreground text-xs font-medium">Sujet</p>
                <p className="text-foreground truncate text-sm font-semibold">{filled.subject}</p>
              </div>
              <iframe
                title="Aperçu du mail"
                className="min-h-64 w-full flex-1 border-0"
                srcDoc={filled.html}
              />
            </div>
          )}
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
          <Link
            href={template ? `/templates/${template.id}` : "/templates"}
            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Modifier ce mail
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyHtml()}
              className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Copié !" : "Copier HTML"}
            </button>
            <button
              type="button"
              onClick={openMailApp}
              disabled={!contact.email || !filled}
              className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              App mail
            </button>
            <button
              type="button"
              onClick={openGmail}
              disabled={!contact.email || !filled}
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Envoyer via Gmail
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
