"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Contact,
  Segment,
  SegmentCondition,
  SegmentGroup,
  SEGMENT_BASE_FIELDS,
  SEGMENT_OPERATORS,
  contactFullName,
  contactMatchesSegment,
} from "@/lib/contacts";

const controlClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2.5 py-2 text-sm focus:ring-2 focus:outline-none";

function emptyCondition(): SegmentCondition {
  return { field: "category", operator: "eq", value: "" };
}

export default function SegmentBuilderModal({
  open,
  initial,
  contacts,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Segment | null;
  contacts: Contact[];
  onClose: () => void;
  onSave: (input: { id?: string; name: string; groups: SegmentGroup[] }) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<SegmentGroup[]>([{ conditions: [emptyCondition()] }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setGroups(
      initial && (initial.groups ?? []).length > 0
        ? initial.groups.map((g) => ({ conditions: g.conditions.map((c) => ({ ...c })) }))
        : [{ conditions: [emptyCondition()] }],
    );
    setError("");
  }, [open, initial]);

  // Champs disponibles : base + toutes les colonnes importées (extra:*).
  const fieldOptions = useMemo(() => {
    const extras = Array.from(new Set(contacts.flatMap((c) => Object.keys(c.extra ?? {})))).sort();
    return [
      ...SEGMENT_BASE_FIELDS,
      ...extras.map((k) => ({ id: `extra:${k}`, label: k })),
    ];
  }, [contacts]);

  // Valeurs distinctes d'un champ (pour l'autocomplétion du champ Valeur).
  const distinctValues = useMemo(() => {
    const map = new Map<string, string[]>();
    const collect = (field: string) => {
      if (map.has(field)) return map.get(field)!;
      const set = new Set<string>();
      for (const c of contacts) {
        if (field === "tags") (c.tags ?? []).forEach((t) => t && set.add(t));
        else {
          const v =
            field.startsWith("extra:") ? c.extra?.[field.slice(6)] : fieldRaw(c, field);
          if (v) set.add(v);
        }
        if (set.size > 200) break;
      }
      const arr = Array.from(set).sort();
      map.set(field, arr);
      return arr;
    };
    return collect;
  }, [contacts]);

  const liveGroups = useMemo(
    () => groups.filter((g) => g.conditions.length > 0),
    [groups],
  );

  const matches = useMemo(
    () => contacts.filter((c) => contactMatchesSegment(c, { groups: liveGroups })),
    [contacts, liveGroups],
  );

  if (!open) return null;

  const updateCondition = (gi: number, ci: number, patch: Partial<SegmentCondition>) =>
    setGroups((gs) =>
      gs.map((g, i) =>
        i === gi
          ? { conditions: g.conditions.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
          : g,
      ),
    );

  const addCondition = (gi: number) =>
    setGroups((gs) =>
      gs.map((g, i) => (i === gi ? { conditions: [...g.conditions, emptyCondition()] } : g)),
    );

  const removeCondition = (gi: number, ci: number) =>
    setGroups((gs) =>
      gs
        .map((g, i) =>
          i === gi ? { conditions: g.conditions.filter((_, j) => j !== ci) } : g,
        )
        .filter((g) => g.conditions.length > 0),
    );

  const addGroup = () => setGroups((gs) => [...gs, { conditions: [emptyCondition()] }]);

  const save = async () => {
    setError("");
    if (!name.trim()) {
      setError("Donne un nom au segment.");
      return;
    }
    if (liveGroups.length === 0) {
      setError("Ajoute au moins une condition.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ id: initial?.id, name: name.trim(), groups: liveGroups });
      onClose();
    } catch {
      setError("Erreur pendant l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-foreground text-lg font-bold">
              {initial ? "Modifier le segment" : "Créer un segment"}
            </h2>
            <p className="text-muted-foreground text-xs">
              Conditions reliées par ET dans un bloc, par OU entre les blocs.
            </p>
          </div>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1" aria-label="Fermer">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">Nom du segment</label>
            <input
              className={`${controlClass} w-full`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Institutionnels non français"
              autoFocus
            />
          </div>

          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div className="my-2 flex items-center gap-2">
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 uppercase">
                    Ou
                  </span>
                  <span className="bg-border h-px flex-1" />
                </div>
              )}
              <div className="border-border bg-muted/30 space-y-2 rounded-xl border p-3">
                {group.conditions.map((cond, ci) => {
                  const op = SEGMENT_OPERATORS.find((o) => o.id === cond.operator);
                  const listId = `seg-${gi}-${ci}-vals`;
                  return (
                    <div key={ci}>
                      {ci > 0 && (
                        <div className="mb-2 text-[11px] font-bold text-gray-400 uppercase">Et</div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className={controlClass}
                          value={cond.field}
                          onChange={(e) => updateCondition(gi, ci, { field: e.target.value })}
                        >
                          {fieldOptions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className={controlClass}
                          value={cond.operator}
                          onChange={(e) =>
                            updateCondition(gi, ci, {
                              operator: e.target.value as SegmentCondition["operator"],
                            })
                          }
                        >
                          {SEGMENT_OPERATORS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {op?.needsValue && (
                          <>
                            <input
                              className={`${controlClass} min-w-40 flex-1`}
                              value={cond.value}
                              list={listId}
                              onChange={(e) => updateCondition(gi, ci, { value: e.target.value })}
                              placeholder="valeur…"
                            />
                            <datalist id={listId}>
                              {distinctValues(cond.field)
                                .slice(0, 100)
                                .map((v) => (
                                  <option key={v} value={v} />
                                ))}
                            </datalist>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCondition(gi, ci)}
                          className="hover:bg-card ml-auto rounded p-1.5"
                          aria-label="Supprimer la condition"
                        >
                          <X className="h-4 w-4 text-gray-400" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addCondition(gi)}
                  className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Et
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addGroup}
            className="border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Ou
          </button>

          {/* Aperçu en direct */}
          <div className="border-border rounded-xl border">
            <div className="border-border flex items-center justify-between border-b px-3 py-2">
              <span className="text-foreground text-sm font-bold">
                {matches.length} contact{matches.length > 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground text-xs">correspondent à ce segment</span>
            </div>
            <div className="max-h-40 overflow-y-auto">
              {matches.slice(0, 30).map((c) => (
                <div
                  key={c.id}
                  className="border-border flex items-center justify-between gap-3 border-b px-3 py-1.5 text-sm last:border-b-0"
                >
                  <span className="text-foreground truncate font-medium">
                    {contactFullName(c) || c.email || "—"}
                  </span>
                  <span className="text-muted-foreground shrink-0 truncate text-xs">
                    {c.company || c.email}
                  </span>
                </div>
              ))}
              {matches.length === 0 && (
                <p className="text-muted-foreground px-3 py-4 text-center text-xs">
                  Aucun contact ne correspond encore.
                </p>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="border-border flex items-center justify-between gap-3 border-t px-6 py-4">
          <span className="text-muted-foreground truncate text-xs">
            {liveGroups.length > 1
              ? `${liveGroups.length} blocs (OU)`
              : liveGroups[0]
                ? `${liveGroups[0].conditions.length} condition${liveGroups[0].conditions.length > 1 ? "s" : ""}`
                : "Aucune condition"}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : initial ? "Enregistrer" : "Créer le segment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Accès brut sans dépendre de l'export (évite un import circulaire de style).
function fieldRaw(c: Contact, field: string): string {
  switch (field) {
    case "name":
      return contactFullName(c);
    case "firstName":
      return c.firstName ?? "";
    case "lastName":
      return c.lastName ?? "";
    case "email":
      return c.email ?? "";
    case "phone":
      return c.phone ?? "";
    case "company":
      return c.company ?? "";
    case "category":
      return c.category ?? "";
    case "stage":
      return c.stage ?? "";
    default:
      return "";
  }
}
