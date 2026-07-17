"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Mail, MessageSquare, FileText, SquarePen, Copy, Trash2 } from "lucide-react";
import { TemplateType, templatePreview, useTemplates } from "@/lib/templates";

const TYPE_ICON: Record<TemplateType, typeof Mail> = {
  Email: Mail,
  SMS: MessageSquare,
  Note: FileText,
};

const FILTERS: { label: string; value: "Tous" | TemplateType }[] = [
  { label: "Tous", value: "Tous" },
  { label: "Emails", value: "Email" },
  { label: "SMS", value: "SMS" },
  { label: "Notes", value: "Note" },
];

export default function TemplatesPage() {
  const { templates, loading, deleteTemplate, duplicateTemplate } = useTemplates();
  const [filter, setFilter] = useState<"Tous" | TemplateType>("Tous");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const visible =
    filter === "Tous" ? templates : templates.filter((t) => t.type === filter);

  return (
    <>
      {/* En-tête de page */}
      <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Templates
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Gérez vos templates d&apos;emails, SMS et notes
            </p>
          </div>
          <div className="shrink-0">
            <Link
              href="/templates/new"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-block cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold shadow-(--shadow-card) transition-all duration-200"
            >
              <Plus className="mr-2 inline h-4 w-4" aria-hidden="true" />
              Nouveau template
            </Link>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Filtres */}
        <div className="mb-8 flex flex-wrap gap-3">
          {FILTERS.map(({ label, value }) => {
            const active = filter === value;
            const count =
              value === "Tous"
                ? templates.length
                : templates.filter((t) => t.type === value).length;
            const Icon = value !== "Tous" ? TYPE_ICON[value] : null;
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={
                  "group cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 " +
                  (active
                    ? "bg-primary text-primary-foreground shadow-(--shadow-card)"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground border shadow-sm")
                }
              >
                <span className="flex items-center gap-2">
                  {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                  <span>{label}</span>
                  {value === "Tous" && (
                    <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Grille de templates */}
        {!loading && visible.length === 0 && (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground text-sm">
              Aucun template — crée le premier avec « Nouveau template ».
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((template) => {
            const Icon = TYPE_ICON[template.type];
            return (
              <div
                key={template.id}
                className="group border-border bg-card hover:border-primary/30 relative overflow-hidden rounded-2xl border p-6 shadow-(--shadow-card) transition-all duration-300"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                      <Icon className="h-5 w-5 text-blue-600" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-foreground group-hover:text-primary text-lg font-bold transition-colors">
                        {template.name}
                      </h3>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">
                          {template.type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted mb-3 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs font-medium">
                    Sujet
                  </p>
                  <p className="text-foreground mt-1 text-sm font-semibold">
                    {template.subject || "—"}
                  </p>
                </div>

                <div className="mb-4">
                  <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
                    {templatePreview(template)}
                  </p>
                </div>

                <div className="border-border flex items-center justify-end gap-2 border-t pt-4">
                  <Link
                    href={`/templates/${template.id}`}
                    title="Modifier"
                    className="text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer rounded-lg p-2 transition-all duration-200"
                  >
                    <SquarePen className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    title="Dupliquer"
                    onClick={() => void duplicateTemplate(template.id)}
                    className="text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer rounded-lg p-2 transition-all duration-200"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {confirmDeleteId === template.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        void deleteTemplate(template.id);
                      }}
                      onBlur={() => setConfirmDeleteId(null)}
                      className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                    >
                      Confirmer ?
                    </button>
                  ) : (
                    <button
                      type="button"
                      title="Supprimer"
                      onClick={() => setConfirmDeleteId(template.id)}
                      className="text-muted-foreground cursor-pointer rounded-lg p-2 transition-all duration-200 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
