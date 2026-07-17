"use client";

import { useEffect, useState } from "react";
import { Trash2, Video, X } from "lucide-react";
import { AgendaEvent, AgendaEventInput, EventType } from "@/lib/agenda";
import { contactFullName, useContacts } from "@/lib/contacts";

interface Props {
  open: boolean;
  initial?: AgendaEvent | null; // édition si fourni
  defaults?: Partial<AgendaEventInput>; // pré-remplissage à la création
  onClose: () => void;
  onSave: (input: AgendaEventInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const EMPTY: AgendaEventInput = {
  type: "rdv",
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  contactId: "",
  contactName: "",
  notes: "",
  visio: false,
  done: false,
};

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";
const labelClass = "text-foreground mb-1 block text-xs font-medium";

export default function EventModal({ open, initial, defaults, onClose, onSave, onDelete }: Props) {
  const { contacts } = useContacts();
  const [form, setForm] = useState<AgendaEventInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial } : { ...EMPTY, ...defaults });
      setError("");
      setConfirmDelete(false);
    }
  }, [open, initial, defaults]);

  if (!open) return null;

  const isRdv = form.type === "rdv";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Donne un titre.");
      return;
    }
    if (!form.date) {
      setError("Choisis une date.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
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
      <div
        className="bg-card w-full max-w-md rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">
            {initial ? "Modifier" : "Nouveau"} {isRdv ? "rendez-vous" : "— tâche"}
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
          <div className="flex gap-1">
            {(["rdv", "tache"] as EventType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors " +
                  (form.type === t
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-border bg-card text-muted-foreground hover:bg-muted")
                }
              >
                {t === "rdv" ? "Rendez-vous" : "Tâche"}
              </button>
            ))}
          </div>

          <div>
            <label className={labelClass}>Titre</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={isRdv ? "Appel de qualification" : "Relancer le prospect"}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className={isRdv ? "" : "col-span-3"}>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                className={inputClass}
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            {isRdv && (
              <>
                <div>
                  <label className={labelClass}>Début</label>
                  <input
                    type="time"
                    className={inputClass}
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fin</label>
                  <input
                    type="time"
                    className={inputClass}
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className={labelClass}>Contact lié (optionnel)</label>
            <select
              className={inputClass}
              value={form.contactId}
              onChange={(e) => {
                const id = e.target.value;
                const c = contacts.find((x) => x.id === id);
                setForm((f) => ({
                  ...f,
                  contactId: id,
                  contactName: c ? contactFullName(c) || c.email : "",
                }));
              }}
            >
              <option value="">— Aucun —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactFullName(c) || c.email}
                  {c.company ? ` (${c.company})` : ""}
                </option>
              ))}
            </select>
          </div>

          {isRdv && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.visio}
                onChange={(e) => setForm((f) => ({ ...f, visio: e.target.checked }))}
                className="h-4 w-4"
              />
              <Video className="h-4 w-4 text-green-600" aria-hidden="true" />
              <span className="text-foreground">
                Visio{" "}
                <span className="text-muted-foreground text-xs">
                  (lien Google Meet généré une fois Google connecté)
                </span>
              </span>
            </label>
          )}

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div>
              {initial && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    void onDelete(initial.id).then(onClose);
                  }}
                  className={
                    confirmDelete
                      ? "rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
                      : "text-muted-foreground rounded-lg p-2 transition-colors hover:bg-red-50 hover:text-red-500"
                  }
                  aria-label="Supprimer"
                >
                  {confirmDelete ? "Confirmer ?" : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                </button>
              )}
            </div>
            <div className="flex gap-3">
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
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
