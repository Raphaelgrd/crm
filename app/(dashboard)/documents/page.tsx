"use client";

import { useState } from "react";
import { Search, Settings2, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useContacts } from "@/lib/contacts";
import type { Contact } from "@/lib/contacts";
import {
  useDocumentTemplates,
  DEFAULT_NDA_TEMPLATE,
  DEFAULT_MOU_TEMPLATE,
  DEFAULT_CERFA_TEMPLATE,
} from "@/lib/documentTemplates";
import type { DocumentType, DocumentTemplate } from "@/lib/documentTemplates";
import GenerateDocumentModal from "@/components/documents/GenerateDocumentModal";

const DOC_CARDS: {
  type: DocumentType;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  ring: string;
  defaultContent: string;
}[] = [
  {
    type: "NDA",
    title: "NDA",
    subtitle: "Accord de confidentialité",
    description: "Protège les informations échangées entre les deux parties.",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    ring: "ring-violet-400",
    defaultContent: DEFAULT_NDA_TEMPLATE,
  },
  {
    type: "MOU",
    title: "MOU",
    subtitle: "Mémorandum d'entente",
    description: "Formalise un accord de principe entre deux parties.",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    ring: "ring-blue-400",
    defaultContent: DEFAULT_MOU_TEMPLATE,
  },
  {
    type: "CERFA",
    title: "CERFA",
    subtitle: "Licence d'exportation",
    description: "Demande de licence pour l'exportation de matériels de défense.",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    ring: "ring-emerald-400",
    defaultContent: DEFAULT_CERFA_TEMPLATE,
  },
];

export default function DocumentsPage() {
  const { contacts } = useContacts();
  const { templates } = useDocumentTemplates();

  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [query, setQuery] = useState("");
  const [generating, setGenerating] = useState<{ contact: Contact; template: DocumentTemplate } | null>(null);

  const filtered = query.trim()
    ? contacts
        .filter((c) =>
          `${c.firstName} ${c.lastName} ${c.company} ${c.email}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  function getTemplate(type: DocumentType): DocumentTemplate {
    const saved = templates.find((t) => t.type === type);
    if (saved) return saved;
    const card = DOC_CARDS.find((c) => c.type === type)!;
    return {
      id: `default_${type}`,
      name: card.subtitle,
      type,
      content: card.defaultContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function handleGenerate() {
    if (!selectedType || !selectedContact) return;
    setGenerating({ contact: selectedContact, template: getTemplate(selectedType) });
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Documents légaux</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Générés et pré-remplis par l'IA à partir de la fiche contact</p>
        </div>
        <Link
          href="/documents/modeles"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Gérer les modèles
        </Link>
      </div>

      {/* Step 1 — Type */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          1. Type de document
        </p>
        <div className="grid grid-cols-3 gap-3">
          {DOC_CARDS.map((card) => {
            const active = selectedType === card.type;
            return (
              <button
                key={card.type}
                onClick={() => setSelectedType(card.type)}
                className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                  active
                    ? `border-primary bg-primary/5 ring-2 ${card.ring} ring-offset-2 ring-offset-background`
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                {active && (
                  <span className="absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </span>
                )}
                <span className={`self-start text-xs font-bold px-2 py-0.5 rounded-full border ${card.badge}`}>
                  {card.title}
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">{card.subtitle}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — Contact */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          2. Contact destinataire
        </p>

        {selectedContact ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                {selectedContact.firstName?.[0] ?? ""}
                {selectedContact.lastName?.[0] ?? ""}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {[selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(" ") ||
                    selectedContact.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[selectedContact.company, selectedContact.country].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedContact(null);
                setQuery("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Changer
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher un contact…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-xl bg-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {filtered.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden divide-y divide-border">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedContact(c);
                      setQuery("");
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-accent transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                      {c.firstName?.[0]}
                      {c.lastName?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{c.company || c.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generate */}
      <button
        onClick={handleGenerate}
        disabled={!selectedType || !selectedContact}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        Générer le document
        <ChevronRight className="h-4 w-4" />
      </button>

      {generating && (
        <GenerateDocumentModal
          contact={generating.contact}
          template={generating.template}
          onClose={() => setGenerating(null)}
        />
      )}
    </div>
  );
}
