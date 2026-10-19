"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import type { Contact } from "@/lib/contacts";

interface Field {
  id: string;
  label: string;
}

const CORE_FIELDS: Field[] = [
  { id: "firstName", label: "Prénom" },
  { id: "lastName", label: "Nom" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Téléphone" },
  { id: "company", label: "Société" },
  { id: "country", label: "Pays" },
  { id: "category", label: "Catégorie" },
  { id: "stage", label: "Étape" },
  { id: "tags", label: "Tags" },
  { id: "notes", label: "Notes" },
  { id: "nextFollowUpAt", label: "Prochaine relance" },
  { id: "lastEmailSentAt", label: "Dernier email" },
];

function formatValue(contact: Contact, fieldId: string): string {
  if (fieldId === "tags") return (contact.tags ?? []).join("; ");
  if (fieldId.startsWith("extra:")) {
    const key = fieldId.slice(6);
    return contact.extra?.[key] ?? "";
  }
  const val = (contact as unknown as Record<string, unknown>)[fieldId];
  if (val === null || val === undefined) return "";
  return String(val);
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  filteredContacts: Contact[];
  extraKeys: string[];
}

export default function ExportModal({ open, onClose, contacts, filteredContacts, extraKeys }: Props) {
  const extraFields: Field[] = extraKeys.map((k) => ({ id: `extra:${k}`, label: k }));
  const allFields = [...CORE_FIELDS, ...extraFields];

  const DEFAULT_SELECTED = ["firstName", "lastName", "email", "phone", "company", "stage"];
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_SELECTED));
  const [scope, setScope] = useState<"filtered" | "all">("filtered");

  useEffect(() => {
    if (open) {
      setSelected(new Set(DEFAULT_SELECTED));
      setScope("filtered");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChecked = allFields.every((f) => selected.has(f.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(allFields.map((f) => f.id)));
  };

  const exportContacts = scope === "filtered" ? filteredContacts : contacts;

  const handleExport = () => {
    const orderedFields = allFields.filter((f) => selected.has(f.id));
    if (orderedFields.length === 0) return;

    const header = orderedFields.map((f) => escapeCSV(f.label)).join(",");
    const rows = exportContacts.map((c) =>
      orderedFields.map((f) => escapeCSV(formatValue(c, f.id))).join(","),
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-netforce-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="bg-black/50 fixed inset-0" onClick={onClose} />
      <div className="bg-card border-border relative z-10 w-full rounded-t-2xl border p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-foreground text-base font-semibold">Exporter les contacts</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scope */}
        <div className="bg-muted mb-4 flex rounded-lg p-1">
          <button
            type="button"
            onClick={() => setScope("filtered")}
            className={
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (scope === "filtered" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
            }
          >
            Contacts affichés ({filteredContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (scope === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
            }
          >
            Tous ({contacts.length})
          </button>
        </div>

        {/* Fields */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Colonnes à exporter</p>
          <button
            type="button"
            onClick={toggleAll}
            className="text-primary text-xs font-medium hover:underline"
          >
            {allChecked ? "Tout décocher" : "Tout cocher"}
          </button>
        </div>

        <div className="mb-5 grid max-h-56 grid-cols-2 gap-1 overflow-y-auto">
          {allFields.map((f) => (
            <label key={f.id} className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
              />
              <span className="truncate">{f.label}</span>
            </label>
          ))}
        </div>

        <button
          type="button"
          disabled={selected.size === 0}
          onClick={handleExport}
          className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Exporter en CSV
        </button>
      </div>
    </div>
  );
}
