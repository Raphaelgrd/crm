"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { authFetch } from "@/lib/rapport";

// Historique IA : qui a utilisé l'IA du CRM, pour quoi, avec quel modèle et pour quel coût (toute l'équipe).
// Les admins fixent le plafond mensuel de Claude ; au-delà, les IA gratuites prennent le relais.

interface Entry {
  id: string;
  at: string;
  email?: string;
  name?: string;
  feature: string;
  agentName: string | null;
  provider: string;
  model: string;
  premium: boolean;
  input: number;
  output: number;
  cacheRead: number;
  costUsd: number;
}
interface Group {
  key: string;
  calls: number;
  costUsd: number;
}
interface Data {
  month: string;
  entries: Entry[];
  total: number;
  byPerson: Group[];
  byFeature: Group[];
  budget: { month: string; spentUsd: number; budgetUsd: number; reached: boolean };
  months: { month: string; costUsd: number; calls: number }[];
  isAdmin: boolean;
}
interface Member {
  email: string;
  name: string;
}

const FEATURES: Record<string, string> = {
  "siege-discussion": "Siège · discussion",
  "siege-livrable": "Siège · livrable",
  "siege-plan": "Siège · plan",
  "siege-reunion": "Siège · réunion",
  "siege-echange": "Siège · question entre agents",
  siege: "Siège",
  assistant: "Assistant IA",
  "carte-de-visite": "Carte de visite",
  "resume-activite": "Résumé d'activité",
  "resume-quotidien": "Résumé quotidien",
  pointage: "Pointage",
  diagnostic: "Test des IA",
  autre: "Autre",
};
const featureLabel = (f: string) => FEATURES[f] ?? f;
const usd = (n: number, digits = 2) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;
const cost = (n: number) => (n === 0 ? "gratuit" : n < 0.01 ? usd(n, 4) : usd(n, 3));
const monthLabel = (m: string) => new Date(`${m}-15`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const shortModel = (m: string) =>
  m
    .replace(/^claude-/, "Claude ")
    .replace(/-(\d)-(\d)$/, " $1.$2")
    .replace(/-/g, " ")
    .replace(/\b(opus|sonnet|haiku|fable)\b/, (w) => w[0].toUpperCase() + w.slice(1));

export default function AiHistoryPage() {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (m: string) => {
    setError("");
    try {
      const res = await authFetch(`/api/ai/usage${m ? `?month=${m}` : ""}`, { cache: "no-store" });
      const j = (await res.json()) as Data & { error?: string };
      if (!res.ok || !j.entries) throw new Error(j.error ?? `Erreur ${res.status}`);
      setData(j);
      setBudgetInput(String(j.budget.budgetUsd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [load, month]);

  useEffect(() => {
    void authFetch("/api/team")
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((j: { members?: Member[] }) => setTeam(j.members ?? []))
      .catch(() => {});
  }, []);

  const nameOf = useMemo(() => {
    const map = new Map(team.map((m) => [m.email.toLowerCase(), m.name]));
    return (e: { email?: string; name?: string }) => (e.email && map.get(e.email.toLowerCase())) || e.name || e.email?.split("@")[0] || "Automatique";
  }, [team]);

  const saveBudget = async () => {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const res = await authFetch("/api/ai/usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetUsd: Number(budgetInput.replace(",", ".")) }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Erreur ${res.status}`);
      setNotice("Plafond enregistré.");
      await load(month);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const isCurrent = data && data.month === data.budget.month;
  const spent = data ? (isCurrent ? data.budget.spentUsd : (data.months.find((m) => m.month === data.month)?.costUsd ?? 0)) : 0;
  const pct = data && data.budget.budgetUsd > 0 ? Math.min(100, (spent / data.budget.budgetUsd) * 100) : 0;
  const claudeCalls = data ? data.entries.filter((e) => e.provider === "Claude").length : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Historique IA</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Chaque réponse de l&apos;IA du CRM : qui l&apos;a demandée, pour quoi, avec quel modèle et pour quel coût.
          </p>
        </div>
        {data && data.months.length > 0 && (
          <select
            value={data.month}
            onChange={(e) => setMonth(e.target.value)}
            className="border-border bg-card rounded-lg border px-3 py-2 text-sm"
            aria-label="Mois affiché"
          >
            {[...new Set([data.budget.month, ...data.months.map((m) => m.month)])].map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      {notice && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p>}
      {!data && !error && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border-border bg-card rounded-2xl border p-4 shadow-(--shadow-card)">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Dépense Claude · {monthLabel(data.month)}</p>
              <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{usd(spent)}</p>
              {isCurrent && (
                <>
                  <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full" aria-hidden="true">
                    <div className={"h-full rounded-full " + (data.budget.reached ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={"mt-1 text-xs " + (data.budget.reached ? "font-semibold text-red-700" : "text-muted-foreground")}>
                    {data.budget.reached
                      ? `Plafond de ${usd(data.budget.budgetUsd)} atteint : les IA gratuites répondent jusqu'à la fin du mois.`
                      : `sur un plafond de ${usd(data.budget.budgetUsd)} par mois`}
                  </p>
                </>
              )}
            </div>
            <div className="border-border bg-card rounded-2xl border p-4 shadow-(--shadow-card)">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Réponses</p>
              <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{data.total}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {claudeCalls} par Claude · {data.entries.length - claudeCalls} par les IA gratuites
                {data.total > data.entries.length ? " (400 dernières affichées)" : ""}
              </p>
            </div>
            <div className="border-border bg-card rounded-2xl border p-4 shadow-(--shadow-card)">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Plafond mensuel de Claude</p>
              {data.isAdmin ? (
                <form
                  className="mt-2 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveBudget();
                  }}
                >
                  <input
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    inputMode="decimal"
                    className="border-border bg-card w-24 rounded-lg border px-3 py-1.5 text-sm tabular-nums"
                    aria-label="Plafond mensuel en dollars"
                  />
                  <span className="text-muted-foreground text-sm">$</span>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "…" : "Enregistrer"}
                  </button>
                </form>
              ) : (
                <p className="text-foreground mt-1 text-2xl font-bold tabular-nums">{usd(data.budget.budgetUsd)}</p>
              )}
              <p className="text-muted-foreground mt-1 text-xs">Facturé en dollars par Anthropic. 0 $ = Claude coupé.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { title: "Par personne", rows: data.byPerson, label: (k: string) => k },
              { title: "Par usage", rows: data.byFeature, label: featureLabel },
            ].map((t) => (
              <section key={t.title} className="border-border bg-card overflow-hidden rounded-2xl border shadow-(--shadow-card)">
                <h2 className="text-foreground border-border border-b px-4 py-3 text-sm font-bold">{t.title}</h2>
                <ul className="divide-border divide-y">
                  {t.rows.map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="text-foreground min-w-0 truncate">{t.title === "Par personne" ? (r.key.includes("@") ? nameOf({ email: r.key }) : r.key) : t.label(r.key)}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {r.calls} réponse{r.calls > 1 ? "s" : ""} · <span className="text-foreground font-semibold">{cost(r.costUsd)}</span>
                      </span>
                    </li>
                  ))}
                  {!t.rows.length && <li className="text-muted-foreground px-4 py-3 text-sm">Rien ce mois-ci.</li>}
                </ul>
              </section>
            ))}
          </div>

          <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-(--shadow-card)">
            <h2 className="text-foreground border-border border-b px-4 py-3 text-sm font-bold">Détail</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Personne</th>
                    <th className="px-4 py-2 font-semibold">Usage</th>
                    <th className="px-4 py-2 font-semibold">Agent</th>
                    <th className="px-4 py-2 font-semibold">Modèle</th>
                    <th className="px-4 py-2 text-right font-semibold">Jetons (lus / écrits)</th>
                    <th className="px-4 py-2 text-right font-semibold">Coût</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="text-muted-foreground px-4 py-2 whitespace-nowrap tabular-nums">{when(e.at)}</td>
                      <td className="text-foreground px-4 py-2 whitespace-nowrap">{nameOf(e)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{featureLabel(e.feature)}</td>
                      <td className="text-muted-foreground px-4 py-2">{e.agentName ?? "—"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {e.provider === "Claude" ? shortModel(e.model) : `${e.provider} (gratuit)`}
                        {e.premium && <span className="bg-primary/10 text-primary ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">PREMIUM</span>}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 text-right whitespace-nowrap tabular-nums">
                        {(e.input + e.cacheRead).toLocaleString("fr-FR")} / {e.output.toLocaleString("fr-FR")}
                      </td>
                      <td className="text-foreground px-4 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{cost(e.costUsd)}</td>
                    </tr>
                  ))}
                  {!data.entries.length && (
                    <tr>
                      <td colSpan={7} className="text-muted-foreground px-4 py-6 text-center">
                        Aucune utilisation de l&apos;IA ce mois-ci.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
