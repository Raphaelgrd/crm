"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus, Mail, MessageSquare, FileText, SquarePen, Copy, Trash2,
  Send, Search, ExternalLink, ClipboardCopy, Check,
} from "lucide-react";
import {
  TemplateType, templatePreview, useTemplates,
  renderEmailText, renderPlainText, fillVariables,
} from "@/lib/templates";

const TYPE_ICON: Record<TemplateType, typeof Mail> = {
  Email: Mail,
  SMS: MessageSquare,
  Note: FileText,
};

const TYPE_STYLE: Record<TemplateType, { icon: string; badge: string }> = {
  Email: {
    icon: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    badge: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  SMS: {
    icon: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
    badge: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  },
  Note: {
    icon: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    badge: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
};

const FILTERS: { label: string; value: "Tous" | TemplateType }[] = [
  { label: "Tous", value: "Tous" },
  { label: "Emails", value: "Email" },
  { label: "SMS", value: "SMS" },
  { label: "Notes", value: "Note" },
];

import type { EmailTemplate } from "@/lib/templates";

function useTemplate(t: EmailTemplate, setCopiedId: (id: string) => void) {
  if (t.type === "Email") {
    const subject = encodeURIComponent(t.subject);
    const body = encodeURIComponent(renderEmailText(t));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  } else if (t.type === "SMS") {
    const body = encodeURIComponent(renderPlainText(t));
    window.location.href = `sms:?body=${body}`;
  } else {
    void navigator.clipboard.writeText(fillVariables(renderPlainText(t))).then(() => {
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(""), 2000);
    });
  }
}

export default function TemplatesPage() {
  const { templates, loading, deleteTemplate, duplicateTemplate } = useTemplates();
  const [filter, setFilter] = useState<"Tous" | TemplateType>("Tous");
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState("");

  const welcome = templates.find((t) => t.special === "welcome") ?? null;
  const regular = templates.filter((t) => t.special !== "welcome");

  const visible = regular.filter((t) => {
    const matchType = filter === "Tous" || t.type === filter;
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      templatePreview(t).toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <>
      {/* Header */}
      <div className="border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Templates</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Emails, SMS et notes réutilisables
            </p>
          </div>
          <div className="shrink-0">
            <Link
              href="/templates/new"
              className="bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-2 cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-opacity"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau template
            </Link>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Template spécial welcome */}
        {welcome && (
          <div className="border-primary/30 bg-primary/5 mb-8 flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="bg-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                <Send className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-foreground text-base font-bold">{welcome.name}</h3>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Relié au bouton{" "}
                  <Send className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />{" "}
                  des fiches contact. Sujet :{" "}
                  <span className="text-foreground font-semibold">{welcome.subject}</span>
                </p>
              </div>
            </div>
            <Link
              href={`/templates/${welcome.id}`}
              className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            >
              <SquarePen className="h-4 w-4" aria-hidden="true" />
              Modifier
            </Link>
          </div>
        )}

        {/* Filtres + recherche */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un template…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(({ label, value }) => {
              const active = filter === value;
              const count =
                value === "Tous" ? regular.length : regular.filter((t) => t.type === value).length;
              const Icon = value !== "Tous" ? TYPE_ICON[value] : null;
              return (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={
                    "cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 " +
                    (active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  <span className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                    {label}
                    {value === "Tous" && (
                      <span className={`rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-white/20" : "bg-muted-foreground/20"}`}>
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grille */}
        {!loading && visible.length === 0 && (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground text-sm">
              {search || filter !== "Tous"
                ? "Aucun template ne correspond à cette recherche."
                : "Aucun template — crée le premier avec « Nouveau template »."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((template) => {
            const Icon = TYPE_ICON[template.type];
            const style = TYPE_STYLE[template.type];
            const isCopied = copiedId === template.id;
            return (
              <div
                key={template.id}
                className="group border-border bg-card hover:border-primary/30 relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all duration-300 flex flex-col"
              >
                {/* Header */}
                <div className="mb-3 flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-foreground group-hover:text-primary text-sm font-bold truncate transition-colors">
                      {template.name}
                    </h3>
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${style.badge}`}>
                      {template.type}
                    </span>
                  </div>
                </div>

                {/* Subject (Email + Note only) */}
                {template.subject && (
                  <div className="bg-muted mb-3 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-xs font-medium">Sujet</p>
                    <p className="text-foreground mt-0.5 text-sm font-semibold truncate">{template.subject}</p>
                  </div>
                )}

                {/* Preview */}
                <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed flex-1 mb-4">
                  {templatePreview(template) || <span className="italic">Aucun contenu</span>}
                </p>

                {/* Actions */}
                <div className="border-border flex items-center justify-between border-t pt-3">
                  {/* Utiliser */}
                  <button
                    type="button"
                    onClick={() => useTemplate(template, setCopiedId)}
                    title={
                      template.type === "Email"
                        ? "Ouvrir dans le client mail"
                        : template.type === "SMS"
                        ? "Ouvrir dans l'app SMS"
                        : "Copier le texte"
                    }
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    {isCopied ? (
                      <><Check className="h-3.5 w-3.5 text-green-500" /> Copié !</>
                    ) : template.type === "Note" ? (
                      <><ClipboardCopy className="h-3.5 w-3.5" /> Copier</>
                    ) : (
                      <><ExternalLink className="h-3.5 w-3.5" /> Utiliser</>
                    )}
                  </button>

                  {/* Edit / Duplicate / Delete */}
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/templates/${template.id}`}
                      title="Modifier"
                      className="text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer rounded-lg p-1.5 transition-all"
                    >
                      <SquarePen className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      title="Dupliquer"
                      onClick={() => void duplicateTemplate(template.id)}
                      className="text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer rounded-lg p-1.5 transition-all"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {confirmDeleteId === template.id ? (
                      <button
                        type="button"
                        onClick={() => { setConfirmDeleteId(null); void deleteTemplate(template.id); }}
                        onBlur={() => setConfirmDeleteId(null)}
                        className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground transition-colors"
                      >
                        Confirmer ?
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Supprimer"
                        onClick={() => setConfirmDeleteId(template.id)}
                        className="text-muted-foreground cursor-pointer rounded-lg p-1.5 transition-all hover:bg-destructive/10 hover:text-destructive"
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
      </div>
    </>
  );
}
