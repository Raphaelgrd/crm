"use client";

import { useMemo } from "react";
import { useContacts } from "@/lib/contacts";
import { useAgenda } from "@/lib/agenda";
import { useStock } from "@/lib/stock";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Users, UserPlus, CheckSquare, Package, TrendingUp } from "lucide-react";

function monthKey(iso: string) {
  return iso.slice(0, 7); // "2025-03"
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });
}

export default function DashboardPage() {
  const { contacts, loading: loadingContacts } = useContacts();
  const { events, loading: loadingAgenda } = useAgenda();
  const { levels, loading: loadingStock } = useStock();

  const now = new Date();
  const currentMonth = monthKey(now.toISOString());

  const totalContacts = contacts.length;

  const newThisMonth = useMemo(
    () => contacts.filter((c) => monthKey(c.createdAt) === currentMonth).length,
    [contacts, currentMonth],
  );

  const tasks = useMemo(() => events.filter((e) => e.type === "tache"), [events]);
  const tasksDone = tasks.filter((t) => t.done).length;
  const totalGants = useMemo(() => levels.reduce((sum, l) => sum + l.qty, 0), [levels]);

  const { totalInvest, investorCount } = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const c of contacts) {
      const raw = c.extra?.["Investissement"] ?? "";
      const val = parseInt(raw.replace(/\s/g, ""), 10);
      if (!isNaN(val) && val > 0) {
        total += val;
        count++;
      }
    }
    return { totalInvest: total, investorCount: count };
  }, [contacts]);

  const formatEur = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  // Contacts créés par mois (6 derniers mois)
  const chartData = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d.toISOString()));
    }
    return months.map((m) => ({
      month: monthLabel(m),
      contacts: contacts.filter((c) => monthKey(c.createdAt) === m).length,
    }));
  }, [contacts]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = loadingContacts || loadingAgenda || loadingStock;

  const kpis = [
    {
      label: "Total Contacts",
      value: totalContacts,
      icon: Users,
      accent: "bg-amber-500",
      note: "dans la base",
    },
    {
      label: "Nouveaux ce mois",
      value: newThisMonth,
      icon: UserPlus,
      accent: "bg-emerald-500",
      note: "contacts créés",
    },
    {
      label: "Tâches complétées",
      value: tasksDone,
      icon: CheckSquare,
      accent: "bg-blue-500",
      note: `sur ${tasks.length} au total`,
    },
    {
      label: "Total gants en stock",
      value: totalGants,
      icon: Package,
      accent: "bg-violet-500",
      note: "paires toutes tailles",
    },
  ];

  return (
    <div className="h-full w-full min-w-0">
      <div className="border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="min-w-0">
          <h1 className="text-foreground text-xl font-bold sm:text-2xl">Tableau de bord</h1>
          <p className="text-muted-foreground mt-1 text-sm">Vue d&apos;ensemble de votre activité</p>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Investment banner */}
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/20">
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-amber-400 to-orange-400" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Total intentions d&apos;investissement
              </p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-amber-900 dark:text-amber-100">
                {loading ? (
                  <span className="inline-block h-10 w-36 animate-pulse rounded bg-amber-200 opacity-50 dark:bg-amber-800" />
                ) : (
                  formatEur(totalInvest)
                )}
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {loading ? "" : `${investorCount} investisseur${investorCount > 1 ? "s" : ""} pré-inscrits`}
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/50">
              <TrendingUp className="h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="border-border bg-card relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 shadow-sm"
              >
                <div className={`absolute top-0 left-0 h-1 w-full ${card.accent}`} />
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-muted-foreground text-sm font-medium">{card.label}</p>
                    <p className="text-foreground mt-2 text-3xl font-bold tracking-tight">
                      {loading ? (
                        <span className="inline-block h-8 w-12 animate-pulse rounded bg-current opacity-10" />
                      ) : (
                        card.value
                      )}
                    </p>
                  </div>
                  <div className="bg-muted ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="text-muted-foreground h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">{card.note}</p>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div className="border-border bg-card mt-6 rounded-2xl border p-5 shadow-sm">
          <h3 className="text-foreground text-base font-semibold">Évolution des contacts</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">Contacts créés par mois (6 derniers mois)</p>
          <div className="mt-4 h-64">
            {loading ? (
              <div className="bg-muted flex h-full items-center justify-center rounded-xl">
                <span className="text-muted-foreground text-sm">Chargement…</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 12,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--foreground)",
                    }}
                    formatter={(v) => [v, "Contacts"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="contacts"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#grad)"
                    dot={{ r: 3, fill: "#6366f1" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
