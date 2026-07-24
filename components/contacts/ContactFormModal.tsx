"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Contact,
  ContactInput,
  DEFAULT_CATEGORIES,
  STAGES,
  StageName,
} from "@/lib/contacts";

interface Props {
  open: boolean;
  initial?: Contact | null;
  categories: string[];
  onClose: () => void;
  onSave: (input: ContactInput) => Promise<void>;
}

const EMPTY: ContactInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  category: DEFAULT_CATEGORIES[0],
  stage: "Nouveau",
  notes: "",
  tags: [],
  extra: {},
};

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

export default function ContactFormModal({ open, initial, categories, onClose, onSave }: Props) {
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [tagsText, setTagsText] = useState("");
  const [extraRows, setExtraRows] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
      setTagsText((initial?.tags ?? []).join(", "));
      setExtraRows(
        Object.entries(initial?.extra ?? {}).map(([key, value]) => ({ key, value })),
      );
      setError("");
    }
  }, [open, initial]);

  if (!open) return null;

  const set = (key: keyof ContactInput) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() && !form.lastName.trim() && !form.email.trim()) {
      setError("Renseigne au moins un nom ou un email.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        category: form.category.trim() || "Sans catégorie",
        tags: tagsText
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean),
        extra: Object.fromEntries(
          extraRows
            .filter((r) => r.key.trim())
            .map((r) => [r.key.trim(), r.value]),
        ),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...categories]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-lg rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">
            {initial ? "Modifier le contact" : "Nouveau contact"}
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

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Prénom</label>
              <input
                className={inputClass}
                value={form.firstName}
                onChange={(e) => set("firstName")(e.target.value)}
                placeholder="Jean"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Nom</label>
              <input
                className={inputClass}
                value={form.lastName}
                onChange={(e) => set("lastName")(e.target.value)}
                placeholder="Dupont"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Email</label>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => set("email")(e.target.value)}
                placeholder="jean.dupont@example.com"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Téléphone</label>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">Société</label>
            <input
              className={inputClass}
              value={form.company}
              onChange={(e) => set("company")(e.target.value)}
              placeholder="Acme SAS"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Catégorie</label>
              <input
                className={inputClass}
                list="contact-categories"
                value={form.category}
                onChange={(e) => set("category")(e.target.value)}
                placeholder="Prospect"
              />
              <datalist id="contact-categories">
                {allCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">
                Étape pipeline
              </label>
              <select
                className={inputClass}
                value={form.stage}
                onChange={(e) => set("stage")(e.target.value as StageName)}
              >
                {STAGES.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">
                Tags <span className="text-muted-foreground">(virgules)</span>
              </label>
              <input
                className={inputClass}
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="Institutionnel, Espagne…"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">
                Prochaine relance <span className="text-muted-foreground">(optionnel)</span>
              </label>
              <input
                type="date"
                className={inputClass}
                value={form.nextFollowUpAt ?? ""}
                onChange={(e) => set("nextFollowUpAt")(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Champs personnalisés
            </label>
            <div className="space-y-2">
              {extraRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={`${inputClass} w-2/5`}
                    value={row.key}
                    onChange={(e) =>
                      setExtraRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)),
                      )
                    }
                    placeholder="Nom du champ"
                  />
                  <input
                    className={inputClass}
                    value={row.value}
                    onChange={(e) =>
                      setExtraRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                      )
                    }
                    placeholder="Valeur"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraRows((rows) => rows.filter((_, j) => j !== i))}
                    className="shrink-0 rounded p-2 hover:bg-red-50"
                    aria-label="Supprimer ce champ"
                  >
                    <X className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setExtraRows((rows) => [...rows, { key: "", value: "" }])}
                className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
              >
                + Ajouter un champ
              </button>
            </div>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">Notes</label>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              placeholder="Notes internes…"
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
              {saving ? "Enregistrement…" : initial ? "Enregistrer" : "Créer le contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
