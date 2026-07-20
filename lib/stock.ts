"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

// Stock des gants (Firestore) : 2 modèles × 2 coloris × 4 tailles = 16 refs.
// Collection "stock" : un doc par référence (id = "impact_beige_M", qty).
// Collection "stockMovements" : historique des entrées/sorties.

export const GLOVE_TYPES = [
  { id: "impact", label: "Impact" },
  { id: "flex", label: "Flex" },
] as const;

export const GLOVE_COLORS = [
  { id: "beige", label: "Beige" },
  { id: "noir", label: "Noir" },
] as const;

export const GLOVE_SIZES = ["M", "L", "XL", "XXL"] as const;

export type GloveType = (typeof GLOVE_TYPES)[number]["id"];
export type GloveColor = (typeof GLOVE_COLORS)[number]["id"];
export type GloveSize = (typeof GLOVE_SIZES)[number];

export interface StockLevel {
  id: string; // "impact_beige_M"
  type: GloveType;
  color: GloveColor;
  size: GloveSize;
  qty: number;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  sku: string;
  type: GloveType;
  color: GloveColor;
  size: GloveSize;
  /** Quantité positive ; direction "in" (entrée) ou "out" (sortie). */
  qty: number;
  direction: "in" | "out";
  note: string;
  at: string;
}

export function skuId(type: GloveType, color: GloveColor, size: GloveSize) {
  return `${type}_${color}_${size}`;
}

export function gloveLabel(type: GloveType, color: GloveColor, size?: GloveSize) {
  const t = GLOVE_TYPES.find((x) => x.id === type)?.label ?? type;
  const c = GLOVE_COLORS.find((x) => x.id === color)?.label ?? color;
  return `${t} ${c}${size ? ` — ${size}` : ""}`;
}

const levelsStore = createCollectionStore<StockLevel>("stock");
const movementsStore = createCollectionStore<StockMovement>("stockMovements");

function makeId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Quantité en stock d'une référence (0 si jamais initialisée). */
export function levelFor(
  levels: StockLevel[],
  type: GloveType,
  color: GloveColor,
  size: GloveSize,
): number {
  return levels.find((l) => l.id === skuId(type, color, size))?.qty ?? 0;
}

export function useStock() {
  const [levels, setLevels] = useState<StockLevel[]>(levelsStore.get());
  const [movements, setMovements] = useState<StockMovement[]>(movementsStore.get());
  const [loading, setLoading] = useState(!levelsStore.ready());

  useEffect(() => {
    const unsubs = [
      levelsStore.subscribe(() => {
        setLevels(levelsStore.get());
        setLoading(false);
      }),
      movementsStore.subscribe(() =>
        setMovements([...movementsStore.get()].sort((a, b) => b.at.localeCompare(a.at))),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  /**
   * Enregistre une entrée ou une sortie. Refuse une sortie supérieure au
   * stock restant (retourne un message d'erreur, sinon null).
   */
  const addMovement = useCallback(
    async (input: {
      type: GloveType;
      color: GloveColor;
      size: GloveSize;
      qty: number;
      direction: "in" | "out";
      note: string;
    }): Promise<string | null> => {
      if (!Number.isFinite(input.qty) || input.qty <= 0) {
        return "La quantité doit être supérieure à zéro.";
      }
      const id = skuId(input.type, input.color, input.size);
      const current = levelsStore.get().find((l) => l.id === id)?.qty ?? 0;
      const delta = input.direction === "in" ? input.qty : -input.qty;
      const next = current + delta;
      if (next < 0) {
        return `Stock insuffisant : il reste ${current} paire${current > 1 ? "s" : ""} en ${gloveLabel(input.type, input.color, input.size)}.`;
      }
      const now = new Date().toISOString();
      await levelsStore.set({
        id,
        type: input.type,
        color: input.color,
        size: input.size,
        qty: next,
        updatedAt: now,
      });
      await movementsStore.set({
        id: makeId(),
        sku: id,
        type: input.type,
        color: input.color,
        size: input.size,
        qty: input.qty,
        direction: input.direction,
        note: input.note.trim(),
        at: now,
      });
      return null;
    },
    [],
  );

  return { levels, movements, loading, addMovement };
}
