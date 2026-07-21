"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, GripVertical, Plus, X } from "lucide-react";

export interface ColumnDef {
  id: string;
  label: string;
}

/**
 * Panneau latéral « Attributs visibles sous forme de colonnes » façon Brevo :
 * pastilles réordonnables par glisser-déposer, sélecteur d'attributs à ajouter,
 * Annuler / Enregistrer. La colonne « Nom » reste fixe en première position et
 * n'est pas gérée ici.
 */
export default function ColumnsPanel({
  open,
  allColumns,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  allColumns: ColumnDef[];
  initial: string[];
  onClose: () => void;
  onSave: (cols: string[]) => void;
}) {
  const [cols, setCols] = useState<string[]>(initial);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setCols(initial);
      setSelectorOpen(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const labelOf = (id: string) =>
    allColumns.find((c) => c.id === id)?.label ?? (id.startsWith("extra:") ? id.slice(6) : id);

  const toggle = (id: string) =>
    setCols((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));

  const remove = (id: string) => setCols((cs) => cs.filter((c) => c !== id));

  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    setCols((cs) => {
      const next = [...cs];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIndex(i);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="bg-card flex h-full w-full max-w-sm flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 bg-emerald-50 px-6 py-5">
          <h2 className="text-foreground text-lg font-bold">
            Attributs visibles sous forme de colonnes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-emerald-100 rounded p-1"
            aria-label="Fermer"
          >
            <X className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-muted-foreground text-sm">
            Personnalisez la page Contacts et choisissez les attributs que vous souhaitez afficher
            sous forme de colonnes.
          </p>

          {/* Sélecteur d'attributs */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              className="border-border bg-card text-foreground hover:bg-muted flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Sélectionner les attributs
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            {selectorOpen && (
              <div className="border-border bg-card absolute top-full right-0 left-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border p-1 shadow-lg">
                {allColumns.map((c) => {
                  const on = cols.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                    >
                      <span
                        className={
                          "flex h-4 w-4 items-center justify-center rounded border " +
                          (on ? "border-primary bg-primary text-white" : "border-border")
                        }
                      >
                        {on && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      <span className="text-foreground truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Colonne fixe */}
          <div className="border-border bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2">
            <span className="w-4" />
            <span className="text-muted-foreground flex-1 text-xs font-semibold uppercase">Nom</span>
            <span className="text-muted-foreground text-[10px]">fixe</span>
          </div>

          {/* Pastilles réordonnables */}
          {cols.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs">
              Aucune colonne supplémentaire. Ajoutes-en via « Sélectionner les attributs ».
            </p>
          ) : (
            <div className="space-y-2">
              {cols.map((id, i) => (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDragEnd={() => setDragIndex(null)}
                  className={
                    "border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2 transition-shadow " +
                    (dragIndex === i ? "opacity-60 shadow-md" : "")
                  }
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400" aria-hidden="true" />
                  <span className="text-foreground flex-1 truncate text-xs font-semibold uppercase">
                    {labelOf(id)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    className="hover:bg-muted rounded p-0.5"
                    aria-label={`Retirer la colonne ${labelOf(id)}`}
                  >
                    <X className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-muted-foreground text-[11px]">
            Les attributs supplémentaires (Pays, Territoires, Continent…) proviennent des colonnes
            de ton fichier CSV importé. Glisse les pastilles pour changer l&apos;ordre des colonnes.
          </p>
        </div>

        {/* Pied */}
        <div className="border-border flex items-center justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-foreground hover:bg-muted rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(cols);
              onClose();
            }}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
