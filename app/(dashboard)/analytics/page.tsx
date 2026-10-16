"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Users, MousePointerClick, Eye, Timer, Send, AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useCrmUser } from "@/lib/rapport";

// Statistiques du site netforce-defense.com (Google Analytics 4), lues via
// /api/analytics. Les données ne concernent que les visiteurs ayant accepté
// la mesure d'audience dans le bandeau cookies.

type Item = { label: string; count: number };
type Report = {
  configured: boolean;
  error?: string;
  days: number;
  kpis: {
    users: number; sessions: number; pageViews: number; avgSession: number; engagement: number; leads: number;
    prev: { users: number; sessions: number; pageViews: number; avgSession: number; engagement: number };
  };
  daily: { date: string; users: number; sessions: number }[];
  sources: { source: string; medium: string; sessions: number; users: number; leads: number }[];
  pages: { path: string; views: number; users: number }[];
  countries: { country: string; users: number }[];
  devices: { device: string; users: number }[];
  funnel: { start: number; fields: number; errors: number; abandon: number; leads: number };
  actions: { cta: number; tiers: number; press: number; video: number; map: number; investorRead: number };
  details: {
    abandonByField: { form: string; field: string; count: number }[] | null;
    formsByName: { form: string; event: string; count: number }[] | null;
    tiers: Item[] | null; ctas: Item[] | null; mapCountries: Item[] | null; languages: Item[] | null;
  };
};

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 28, label: "28 jours" },
  { days: 90, label: "90 jours" },
  { days: 365, label: "12 mois" },
];

const nf = (n: number) => n.toLocaleString("fr-FR");
const duration = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;
const pct = (n: number) => `${Math.round(n * 100)} %`;
const dayLabel = (d: string) => `${d.slice(6, 8)}/${d.slice(4, 6)}`;

const SOURCE_NAMES: Record<string, string> = {
  "(direct)": "Accès direct", google: "Google", linkedin: "LinkedIn", "linkedin.com": "LinkedIn",
  "lnkd.in": "LinkedIn", instagram: "Instagram", "l.instagram.com": "Instagram", tiktok: "TikTok",
  facebook: "Facebook", "m.facebook.com": "Facebook", "l.facebook.com": "Facebook", bing: "Bing",
  youtube: "YouTube", email: "Email", "(not set)": "Non renseigné",
};
const FIELD_NAMES: Record<string, string> = {
  prenom: "Prénom", nom: "Nom", email: "Email", tel: "Téléphone", societe: "Société", message: "Message",
  sujets: "Sujets", montantinvest: "Montant", rgpd: "Consentement", profil: "Profil", montant: "Montant",
  telephone: "Téléphone", entreprise: "Entreprise", fonction: "Fonction", ville: "Ville", pays: "Pays",
  connucomment: "Comment nous a connu", connaissaitactivite: "Connaissait l'activité", modeinvest: "Mode d'investissement",
  horizon: "Horizon", dejainvesti: "Déjà investi", criteres: "Critères", observations: "Observations", consentement: "Consentement",
};
const FORM_NAMES: Record<string, string> = { contact: "Contact", distributeur: "Distributeur (carte)", investisseur: "Questionnaire investisseur" };
const DEVICE_NAMES: Record<string, string> = { desktop: "Ordinateur", mobile: "Mobile", tablet: "Tablette" };

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return null;
  const d = (cur - prev) / prev;
  const up = d >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(Math.round(d * 100))} %
    </span>
  );
}

function Kpi({ icon: Icon, label, value, cur, prev }: { icon: typeof Users; label: string; value: string; cur?: number; prev?: number }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-foreground text-2xl font-bold">{value}</span>
        {cur !== undefined && prev !== undefined && <Delta cur={cur} prev={prev} />}
      </div>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4 sm:p-5">
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Bars({ items, empty }: { items: { label: string; value: number; extra?: string }[]; empty?: string }) {
  if (!items.length) return <p className="text-muted-foreground text-sm">{empty ?? "Pas encore de données."}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-foreground truncate">{i.label}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {nf(i.value)}
              {i.extra && <span className="ml-2 text-xs">{i.extra}</span>}
            </span>
          </div>
          <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NeedsDimension({ name }: { name: string }) {
  return (
    <p className="text-muted-foreground text-xs">
      Détail disponible après avoir déclaré la dimension personnalisée <code className="bg-muted rounded px-1">{name}</code> dans
      Google Analytics (Administration → Définitions personnalisées).
    </p>
  );
}

export default function AnalyticsPage() {
  const { user } = useCrmUser();
  const [days, setDays] = useState(28);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/analytics?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as Report;
      if (json.error) setError(json.error);
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const k = data?.kpis;
  const f = data?.funnel;
  const conv = k && k.users ? (k.leads / k.users) * 100 : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-border bg-background border-b px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Analytics site</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              netforce-defense.com · visiteurs ayant accepté la mesure d&apos;audience
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="border-border bg-muted/40 flex rounded-xl border p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setDays(p.days)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    days === p.days ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="border-border text-muted-foreground hover:text-foreground rounded-xl border p-2"
              aria-label="Actualiser"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {data && !data.configured && (
          <div className="border-border bg-card rounded-2xl border p-6">
            <h2 className="text-foreground font-semibold">Connexion à Google Analytics à configurer</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Ajoutez dans Vercel (Settings → Environment Variables) <code className="bg-muted rounded px-1">GA4_PROPERTY_ID</code> et{" "}
              <code className="bg-muted rounded px-1">GA_SERVICE_ACCOUNT_JSON</code>, puis redéployez.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {loading && !data && <p className="text-muted-foreground text-sm">Chargement des statistiques…</p>}

        {data?.configured && k && f && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi icon={Users} label="Visiteurs" value={nf(k.users)} cur={k.users} prev={k.prev.users} />
              <Kpi icon={MousePointerClick} label="Sessions" value={nf(k.sessions)} cur={k.sessions} prev={k.prev.sessions} />
              <Kpi icon={Eye} label="Pages vues" value={nf(k.pageViews)} cur={k.pageViews} prev={k.prev.pageViews} />
              <Kpi icon={Timer} label="Durée moyenne" value={duration(k.avgSession)} cur={k.avgSession} prev={k.prev.avgSession} />
              <Kpi icon={Send} label="Formulaires envoyés" value={nf(k.leads)} />
            </div>

            <Card title="Visiteurs par jour" hint={`Taux d'engagement ${pct(k.engagement)} · ${conv.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des visiteurs envoient un formulaire`}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily.map((d) => ({ ...d, label: dayLabel(d.date) }))} margin={{ left: -20, right: 8 }}>
                    <defs>
                      <linearGradient id="gaUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#137AA9" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#137AA9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip formatter={(v) => [nf(Number(v) || 0), "Visiteurs"]} labelFormatter={(l) => `Le ${l}`} />
                    <Area type="monotone" dataKey="users" stroke="#137AA9" strokeWidth={2} fill="url(#gaUsers)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="D'où viennent les visiteurs" hint="Sessions par source · formulaires envoyés">
                <Bars
                  items={data.sources.map((s) => ({
                    label: `${SOURCE_NAMES[s.source] ?? s.source}${s.medium && s.medium !== "(none)" && s.medium !== "(not set)" ? ` · ${s.medium}` : ""}`,
                    value: s.sessions,
                    extra: s.leads ? `${s.leads} formulaire${s.leads > 1 ? "s" : ""}` : undefined,
                  }))}
                />
              </Card>

              <Card title="Où les visiteurs abandonnent les formulaires" hint="Du premier champ touché à l'envoi">
                <Bars
                  items={[
                    { label: "Formulaire commencé", value: f.start },
                    { label: "Erreurs à l'envoi", value: f.errors },
                    { label: "Abandons", value: f.abandon },
                    { label: "Formulaires envoyés", value: f.leads },
                  ]}
                />
                <div className="border-border mt-5 border-t pt-4">
                  <p className="text-foreground mb-3 text-xs font-semibold">Dernier champ touché avant l&apos;abandon</p>
                  {data.details.abandonByField ? (
                    <Bars
                      items={data.details.abandonByField.map((a) => ({
                        label: `${FIELD_NAMES[a.field] ?? a.field} — ${FORM_NAMES[a.form] ?? a.form}`,
                        value: a.count,
                      }))}
                      empty="Aucun abandon sur la période."
                    />
                  ) : (
                    <NeedsDimension name="form + last_field" />
                  )}
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Pages les plus vues">
                <Bars items={data.pages.map((p) => ({ label: p.path === "/" ? "Accueil" : p.path.replace(/^\/|\.html$/g, ""), value: p.views }))} />
              </Card>
              <Card title="Pays des visiteurs">
                <Bars items={data.countries.map((c) => ({ label: c.country, value: c.users }))} />
              </Card>
              <Card title="Appareils">
                <Bars items={data.devices.map((d) => ({ label: DEVICE_NAMES[d.device] ?? d.device, value: d.users }))} />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Paliers d'investissement cliqués">
                {data.details.tiers ? <Bars items={data.details.tiers.map((t) => ({ label: t.label, value: t.count }))} /> : <NeedsDimension name="tier" />}
              </Card>
              <Card title="Boutons les plus cliqués">
                {data.details.ctas ? (
                  <Bars items={data.details.ctas.map((c) => ({ label: c.label.split(" | ").pop() || c.label, value: c.count }))} />
                ) : (
                  <NeedsDimension name="cta" />
                )}
              </Card>
              <Card title="Intérêt pour les pays (carte distributeurs)">
                {data.details.mapCountries ? <Bars items={data.details.mapCountries.map((c) => ({ label: c.label, value: c.count }))} /> : <NeedsDimension name="country" />}
              </Card>
            </div>

            <Card title="Autres actions" hint={`Sur les ${data.days} derniers jours`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Clics sur boutons", data.actions.cta],
                  ["Paliers cliqués", data.actions.tiers],
                  ["Articles de presse ouverts", data.actions.press],
                  ["Vidéos lancées", data.actions.video],
                  ["Pays cliqués (carte)", data.actions.map],
                  ["Lectures page Investisseurs", data.actions.investorRead],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-muted/40 rounded-xl p-3">
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="text-foreground mt-1 text-lg font-bold">{nf(value as number)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
