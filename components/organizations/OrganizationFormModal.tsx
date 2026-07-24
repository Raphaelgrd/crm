"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { STAGES, StageName } from "@/lib/contacts";
import { ORG_TYPES, Organization, OrganizationInput } from "@/lib/organizations";

interface Props {
  open: boolean;
  initial?: Organization | null;
  /** Nom pré-rempli (ex. conversion d'un groupe auto en fiche). */
  presetName?: string;
  onClose: () => void;
  onSave: (input: OrganizationInput) => Promise<void>;
}

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

function emptyInput(): OrganizationInput {
  return { name: "", type: ORG_TYPES[0], country: "", stage: "", notes: "" };
}

export default function OrganizationFormModal({
  open,
  initial,
  presetName,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<OrganizationInput>(emptyInput());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            name: initial.name,
            type: initial.type,
            country: initial.country,
            stage: initial.stage,
            notes: initial.notes,
          }
        : { ...emptyInput(), name: presetName ?? "" },
    );
    setError("");
  }, [open, initial, presetName]);

  if (!open) return null;

  const set = (key: keyof OrganizationInput) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Donne un nom à l'organisation.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, name: form.name.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div className="bg-card w-full max-w-lg rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">
            {initial ? "Modifier l'organisation" : "Nouvelle organisation"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded p-1 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">Nom</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="Ministère de l'Intérieur"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Type</label>
              <select className={inputClass} value={form.type} onChange={(e) => set("type")(e.target.value)}>
                {ORG_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Pays</label>
              <input
                className={inputClass}
                value={form.country}
                onChange={(e) => set("country")(e.target.value)}
                placeholder="France"
              />
            </div>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Étape du compte <span className="text-muted-foreground">(optionnel)</span>
            </label>
            <select
              className={inputClass}
              value={form.stage}
              onChange={(e) => set("stage")(e.target.value as StageName | "")}
            >
              <option value="">— Aucune —</option>
              {STAGES.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">Notes</label>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              placeholder="Contexte du compte, interlocuteurs clés, historique…"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : initial ? "Enregistrer" : "Créer l'organisation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
