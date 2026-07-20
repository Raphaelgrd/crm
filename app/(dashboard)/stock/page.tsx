"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, Package, X } from "lucide-react";
import {
  GLOVE_COLORS,
  GLOVE_SIZES,
  GLOVE_TYPES,
  GloveColor,
  GloveSize,
  GloveType,
  gloveLabel,
  levelFor,
  useStock,
} from "@/lib/stock";

const LOW_STOCK = 5;

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";
const labelClass = "text-foreground mb-1 block text-xs font-medium";

interface MovementDraft {
  direction: "in" | "out";
  type: GloveType;
  color: GloveColor;
  size: GloveSize;
}

function qtyColor(qty: number) {
  if (qty === 0) return "text-red-600";
  if (qty <= LOW_STOCK) return "text-amber-600";
  return "text-foreground";
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StockPage() {
  const { levels, movements, loading, addMovement } = useStock();

  const [draft, setDraft] = useState<MovementDraft | null>(null);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => levels.reduce((sum, l) => sum + l.qty, 0), [levels]);

  const openMovement = (d: MovementDraft) => {
    setDraft(d);
    setQty("1");
    setNote("");
    setError("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      const err = await addMovement({
        type: draft.type,
        color: draft.color,
        size: draft.size,
        qty: Number(qty),
        direction: draft.direction,
        note,
      });
      if (err) {
        setError(err);
        return;
      }
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Stock</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {loading ? "Chargement…" : `${total} paire${total > 1 ? "s" : ""} de gants en stock`}
              {" — entrées, sorties et historique"}
            </p>
          </div>
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> ≤ {LOW_STOCK} paires
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> épuisé
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Grilles de stock : une carte par modèle × coloris */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {GLOVE_TYPES.map((type) =>
            GLOVE_COLORS.map((color) => {
              const cardTotal = GLOVE_SIZES.reduce(
                (sum, size) => sum + levelFor(levels, type.id, color.id, size),
                0,
              );
              return (
                <div
                  key={`${type.id}_${color.id}`}
                  className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          "flex h-10 w-10 items-center justify-center rounded-xl " +
                          (color.id === "noir" ? "bg-gray-900" : "bg-amber-100")
                        }
                      >
                        <Package
                          className={
                            "h-5 w-5 " + (color.id === "noir" ? "text-white" : "text-amber-700")
                          }
                          aria-hidden="true"
                        />
                      </span>
                      <div>
                        <h3 className="text-foreground text-base font-bold">
                          {type.label} {color.label}
                        </h3>
                        <p className="text-muted-foreground text-xs">
                          {cardTotal} paire{cardTotal > 1 ? "s" : ""} au total
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {GLOVE_SIZES.map((size) => {
                      const q = levelFor(levels, type.id, color.id, size);
                      return (
                        <div
                          key={size}
                          className={
                            "rounded-xl border p-3 text-center " +
                            (q === 0
                              ? "border-red-200 bg-red-50"
                              : q <= LOW_STOCK
                                ? "border-amber-200 bg-amber-50"
                                : "border-border bg-muted/40")
                          }
                        >
                          <p className="text-muted-foreground text-xs font-semibold">{size}</p>
                          <p className={`mt-1 text-2xl font-bold ${qtyColor(q)}`}>{q}</p>
                          <div className="mt-2 flex justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                openMovement({
                                  direction: "out",
                                  type: type.id,
                                  color: color.id,
                                  size,
                                })
                              }
                              disabled={q === 0}
                              className="rounded-lg border border-gray-200 bg-white p-1.5 transition-colors hover:bg-red-50 disabled:opacity-30"
                              aria-label={`Retirer du stock ${gloveLabel(type.id, color.id, size)}`}
                              title="Sortie de stock"
                            >
                              <ArrowUpFromLine className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openMovement({
                                  direction: "in",
                                  type: type.id,
                                  color: color.id,
                                  size,
                                })
                              }
                              className="rounded-lg border border-gray-200 bg-white p-1.5 transition-colors hover:bg-emerald-50"
                              aria-label={`Ajouter au stock ${gloveLabel(type.id, color.id, size)}`}
                              title="Entrée de stock"
                            >
                              <ArrowDownToLine
                                className="h-3.5 w-3.5 text-emerald-600"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }),
          )}
        </div>

        {/* Historique */}
        <div>
          <h2 className="text-foreground mb-3 flex items-center gap-2 text-sm font-bold uppercase">
            <History className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Historique des mouvements
          </h2>
          {movements.length === 0 ? (
            <div className="border-border rounded-xl border border-dashed py-10 text-center">
              <p className="text-muted-foreground text-sm">
                Aucun mouvement pour l&apos;instant — utilise les boutons{" "}
                <ArrowDownToLine className="inline h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> (entrée) et{" "}
                <ArrowUpFromLine className="inline h-3.5 w-3.5 text-red-500" aria-hidden="true" /> (sortie) sur les tailles.
              </p>
            </div>
          ) : (
            <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-(--shadow-card)">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Date</th>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Référence</th>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Mouvement</th>
                    <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 50).map((m) => (
                    <tr key={m.id} className="border-border border-t">
                      <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                        {formatDateTime(m.at)}
                      </td>
                      <td className="text-foreground px-4 py-3 font-semibold whitespace-nowrap">
                        {gloveLabel(m.type, m.color, m.size)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold " +
                            (m.direction === "in"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-600")
                          }
                        >
                          {m.direction === "in" ? (
                            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {m.direction === "in" ? "+" : "−"}
                          {m.qty}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">{m.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modale entrée/sortie */}
      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDraft(null)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-border flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-foreground text-lg font-bold">
                {draft.direction === "in" ? "Entrée de stock" : "Sortie de stock"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="hover:bg-muted rounded p-1 transition-colors"
                aria-label="Fermer"
              >
                <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4 px-6 py-5">
              <p className="text-foreground text-sm">
                <span className="font-semibold">
                  {gloveLabel(draft.type, draft.color, draft.size)}
                </span>{" "}
                <span className="text-muted-foreground">
                  — {levelFor(levels, draft.type, draft.color, draft.size)} en stock
                </span>
              </p>
              <div>
                <label className={labelClass}>
                  Quantité {draft.direction === "in" ? "ajoutée" : "retirée"}
                </label>
                <input
                  type="number"
                  min={1}
                  autoFocus
                  className={inputClass}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Note (optionnel)</label>
                <input
                  className={inputClass}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    draft.direction === "in" ? "Réception fournisseur…" : "Commande client, salon…"
                  }
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={
                    "rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 " +
                    (draft.direction === "in" ? "bg-emerald-600" : "bg-red-500")
                  }
                >
                  {saving
                    ? "Enregistrement…"
                    : draft.direction === "in"
                      ? "Ajouter au stock"
                      : "Retirer du stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
