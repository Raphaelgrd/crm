// Historique d'utilisation de l'IA du CRM : qui a demandé quoi, à quel agent, avec quel modèle, pour quel coût,
// et plafond mensuel de dépense pour Claude (au-delà, les IA gratuites prennent le relais).
// Collections : aiUsage/{id} (une ligne par réponse), aiUsageMonth/{AAAA-MM} (totaux), aiSettings/config (plafond).
import { store } from "./store";

/** Qui demande, et pour quoi (affiché dans « Historique IA »). */
export interface AiMeta {
  email?: string;
  name?: string;
  /** Ex. siege-livrable, siege-discussion, assistant, carte-de-visite… */
  feature: string;
  /** Agent du Siège concerné (id). */
  agent?: string;
}

export interface AiUsageEntry extends AiMeta {
  id: string;
  at: string;
  month: string;
  provider: string;
  model: string;
  premium: boolean;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

/** Prix en dollars par million de jetons (entrée, sortie, lecture du cache). Les IA gratuites coûtent 0. */
const PRICES: { match: RegExp; input: number; output: number; cacheRead: number }[] = [
  { match: /^claude-haiku-5-5/, input: 0.1, output: 0.5, cacheRead: 0.01 },
  { match: /^claude-sonnet-5-5/, input: 2, output: 10, cacheRead: 0.1 },
  { match: /^claude-sonnet/, input: 2, output: 10, cacheRead: 0.2 },
  { match: /^claude-opus-5-5/, input: 4, output: 20, cacheRead: 0.2 },
  { match: /^claude-opus/, input: 5, output: 25, cacheRead: 0.5 },
  { match: /^claude-fable/, input: 8, output: 40, cacheRead: 0.2 },
  { match: /^claude-haiku/, input: 1, output: 5, cacheRead: 0.1 },
];

export function costUsd(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const p = PRICES.find((x) => x.match.test(model));
  if (!p) return 0;
  // Écriture dans le cache : 1,25 fois le prix d'entrée.
  const c = (u.input * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.cacheRead + u.output * p.output) / 1_000_000;
  return Math.round(c * 1_000_000) / 1_000_000;
}

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/** Plafond mensuel par défaut (dollars) tant qu'un admin n'en a pas fixé un dans « Historique IA ». */
const DEFAULT_BUDGET = Number(process.env.AI_MONTHLY_BUDGET_USD ?? 5);

let cache: { month: string; spent: number; budget: number; at: number } | null = null;

/** Dépense du mois et plafond (gardés 30 s en mémoire pour ne pas relire la base à chaque appel). */
export async function budgetStatus(fresh = false): Promise<{ month: string; spentUsd: number; budgetUsd: number; reached: boolean }> {
  const month = monthKey();
  if (!fresh && cache && cache.month === month && Date.now() - cache.at < 30_000) {
    return { month, spentUsd: cache.spent, budgetUsd: cache.budget, reached: cache.spent >= cache.budget };
  }
  const s = await store();
  const [m, cfg] = await Promise.all([s.get("aiUsageMonth", month), s.get("aiSettings", "config")]);
  const spent = Number(m?.costUsd ?? 0);
  const b = Number(cfg?.budgetUsd);
  const budget = Number.isFinite(b) && b >= 0 ? b : DEFAULT_BUDGET;
  cache = { month, spent, budget, at: Date.now() };
  return { month, spentUsd: spent, budgetUsd: budget, reached: spent >= budget };
}

export async function setBudget(budgetUsd: number, by: string) {
  const s = await store();
  await s.set("aiSettings", "config", { budgetUsd, updatedAt: new Date().toISOString(), updatedBy: by });
  cache = null;
}

/** Enregistre une réponse de l'IA (sans jamais faire échouer la réponse elle-même). */
export async function recordUsage(e: Omit<AiUsageEntry, "id" | "at" | "month" | "costUsd">): Promise<void> {
  try {
    const at = new Date();
    const month = monthKey(at);
    const cost = costUsd(e.model, e);
    const id = `${at.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
    const s = await store();
    const entry: Record<string, unknown> = { ...e, id, at: at.toISOString(), month, costUsd: cost };
    Object.keys(entry).forEach((k) => entry[k] === undefined && delete entry[k]);
    await s.set("aiUsage", id, entry);
    const m = (await s.get("aiUsageMonth", month)) ?? {};
    const total = Math.round((Number(m.costUsd ?? 0) + cost) * 1_000_000) / 1_000_000;
    await s.set("aiUsageMonth", month, { month, costUsd: total, calls: Number(m.calls ?? 0) + 1, updatedAt: at.toISOString() });
    if (cache && cache.month === month) cache.spent = total;
  } catch (err) {
    console.error("[aiUsage]", err);
  }
}

/** Historique d'un mois (le plus récent d'abord) et totaux par personne et par usage. */
export async function usageForMonth(month: string) {
  const s = await store();
  const rows = ((await s.where("aiUsage", "month", month)) as unknown as AiUsageEntry[]).sort((a, b) => b.at.localeCompare(a.at));
  const group = (key: (r: AiUsageEntry) => string) => {
    const m = new Map<string, { key: string; calls: number; costUsd: number }>();
    for (const r of rows) {
      const k = key(r);
      const g = m.get(k) ?? { key: k, calls: 0, costUsd: 0 };
      g.calls += 1;
      g.costUsd += r.costUsd || 0;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  };
  return {
    entries: rows.slice(0, 400),
    total: rows.length,
    byPerson: group((r) => r.email || r.name || "Automatique"),
    byFeature: group((r) => r.feature),
  };
}
