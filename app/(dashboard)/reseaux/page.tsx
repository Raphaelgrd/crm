"use client";

import { useMemo, useState } from "react";
import { Plus, X, Trash2, TrendingUp, Users, FileText, Eye } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { PLATFORMS, SocialPlatform, SocialSnapshotInput, useSocial } from "@/lib/social";

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString("fr-FR");
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface AddModalProps {
  onClose: () => void;
  onSave: (input: SocialSnapshotInput) => Promise<unknown>;
}

function AddModal({ onClose, onSave }: AddModalProps) {
  const [platform, setPlatform] = useState<SocialPlatform>("Instagram");
  const [followers, setFollowers] = useState("");
  const [posts, setPosts] = useState("");
  const [views, setViews] = useState("");
  const [date, setDate] = useState(todayDate());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      platform,
      followers: parseInt(followers.replace(/\s/g, ""), 10) || 0,
      posts: parseInt(posts.replace(/\s/g, ""), 10) || 0,
      views: parseInt(views.replace(/\s/g, ""), 10) || 0,
      date,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card w-full max-w-md rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">Ajouter un snapshot</h2>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1 transition-colors">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">Plateforme</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PLATFORMS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">Abonnés</label>
            <input
              type="number"
              min="0"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="Ex : 12500"
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">Publications</label>
              <input
                type="number"
                min="0"
                value={posts}
                onChange={(e) => setPosts(e.target.value)}
                placeholder="Ex : 48"
                className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">Vues totales</label>
              <input
                type="number"
                min="0"
                value={views}
                onChange={(e) => setViews(e.target.value)}
                placeholder="Ex : 250000"
                className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        <div className="border-border flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-border bg-card text-foreground rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={saving || !followers}
            onClick={handleSave}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const PLATFORM_CHART_COLORS: Record<SocialPlatform, string> = {
  Instagram: "#E1306C",
  LinkedIn: "#0A66C2",
  TikTok: "#69C9D0",
  YouTube: "#FF0000",
  Twitter: "#1DA1F2",
  Facebook: "#1877F2",
};

export default function ReseauxPage() {
  const { snapshots, loading, addSnapshot, deleteSnapshot, latestByPlatform, historyByPlatform } = useSocial();
  const [addOpen, setAddOpen] = useState(false);
  const [activeChart, setActiveChart] = useState<"followers" | "views">("followers");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SocialPlatform>>(
    new Set(PLATFORMS.map((p) => p.name)),
  );

  const togglePlatform = (p: SocialPlatform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) { if (next.size > 1) next.delete(p); } else next.add(p);
      return next;
    });
  };

  const chartData = useMemo(() => {
    const dateSet = new Set<string>();
    for (const s of snapshots) dateSet.add(s.date);
    const dates = Array.from(dateSet).sort();
    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const p of PLATFORMS) {
        const snap = snapshots.find((s) => s.platform === p.name && s.date === date);
        if (snap) {
          row[`${p.name}_followers`] = snap.followers;
          row[`${p.name}_views`] = snap.views;
        }
      }
      return row;
    });
  }, [snapshots]);

  const totalFollowers = useMemo(() => {
    let total = 0;
    for (const p of PLATFORMS) {
      const latest = latestByPlatform(p.name);
      if (latest) total += latest.followers;
    }
    return total;
  }, [snapshots]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Réseaux sociaux</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Suivi global de votre présence en ligne
              {totalFollowers > 0 && ` · ${formatNumber(totalFollowers)} abonnés au total`}
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un snapshot
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Platform cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const latest = latestByPlatform(platform.name);
            const history = historyByPlatform(platform.name);
            const prev = history.length >= 2 ? history[history.length - 2] : undefined;
            const followersDiff = latest && prev ? latest.followers - prev.followers : null;

            return (
              <div
                key={platform.name}
                className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${platform.gradient} text-white text-xs font-bold shadow-sm`}
                    >
                      {platform.name.slice(0, 2)}
                    </div>
                    <span className="text-foreground font-semibold">{platform.name}</span>
                  </div>
                  {latest && (
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(latest.date).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>

                {latest ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/40 rounded-xl p-2.5 text-center">
                        <Users className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <p className="text-foreground text-sm font-bold">{formatNumber(latest.followers)}</p>
                        <p className="text-muted-foreground text-[10px]">abonnés</p>
                      </div>
                      <div className="bg-muted/40 rounded-xl p-2.5 text-center">
                        <FileText className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <p className="text-foreground text-sm font-bold">{formatNumber(latest.posts)}</p>
                        <p className="text-muted-foreground text-[10px]">publications</p>
                      </div>
                      <div className="bg-muted/40 rounded-xl p-2.5 text-center">
                        <Eye className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <p className="text-foreground text-sm font-bold">{formatNumber(latest.views)}</p>
                        <p className="text-muted-foreground text-[10px]">vues</p>
                      </div>
                    </div>
                    {followersDiff !== null && (
                      <p className={`text-xs font-medium ${followersDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {followersDiff >= 0 ? "▲" : "▼"} {Math.abs(followersDiff).toLocaleString("fr-FR")} abonnés vs snapshot précédent
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border py-6 text-center">
                    <p className="text-muted-foreground text-xs">Aucune donnée</p>
                    <button
                      onClick={() => setAddOpen(true)}
                      className="text-primary mt-1 text-xs underline underline-offset-2"
                    >
                      Ajouter un snapshot
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Growth chart */}
        {chartData.length > 0 && (
          <div className="border-border bg-card mb-6 rounded-2xl border p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-foreground text-base font-semibold">Évolution</h3>
                <p className="text-muted-foreground mt-0.5 text-xs">Données historiques par plateforme</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="border-border flex rounded-lg border text-xs font-medium overflow-hidden">
                  <button
                    onClick={() => setActiveChart("followers")}
                    className={`px-3 py-1.5 transition-colors ${activeChart === "followers" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Abonnés
                  </button>
                  <button
                    onClick={() => setActiveChart("views")}
                    className={`px-3 py-1.5 transition-colors ${activeChart === "views" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Vues
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => togglePlatform(p.name)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${selectedPlatforms.has(p.name) ? "border-transparent text-white shadow-sm" : "border-border text-muted-foreground"}`}
                      style={selectedPlatforms.has(p.name) ? { backgroundColor: PLATFORM_CHART_COLORS[p.name] } : {}}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) => formatNumber(v as number)}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)" }}
                    formatter={(v, name) => [formatNumber(v as number), String(name).split("_")[0]]}
                    labelFormatter={(l) => new Date(l as string).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  />
                  <Legend formatter={(v) => String(v).split("_")[0]} />
                  {PLATFORMS.filter((p) => selectedPlatforms.has(p.name)).map((p) => (
                    <Line
                      key={p.name}
                      type="monotone"
                      dataKey={`${p.name}_${activeChart}`}
                      stroke={PLATFORM_CHART_COLORS[p.name]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* History table */}
        {snapshots.length > 0 && (
          <div className="border-border bg-card rounded-2xl border shadow-sm">
            <div className="border-border border-b px-5 py-4">
              <h3 className="text-foreground text-base font-semibold">Historique des snapshots</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="text-muted-foreground px-5 py-3 text-left text-xs font-semibold">Date</th>
                    <th className="text-muted-foreground px-5 py-3 text-left text-xs font-semibold">Plateforme</th>
                    <th className="text-muted-foreground px-5 py-3 text-right text-xs font-semibold">Abonnés</th>
                    <th className="text-muted-foreground px-5 py-3 text-right text-xs font-semibold">Publications</th>
                    <th className="text-muted-foreground px-5 py-3 text-right text-xs font-semibold">Vues</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => {
                    const platform = PLATFORMS.find((p) => p.name === s.platform);
                    return (
                      <tr key={s.id} className="border-border border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="text-muted-foreground px-5 py-3 text-xs">
                          {new Date(s.date).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br ${platform?.gradient ?? ""} text-[9px] font-bold text-white shadow-sm`}
                            >
                              {s.platform.slice(0, 2)}
                            </div>
                            <span className="text-foreground text-xs font-medium">{s.platform}</span>
                          </div>
                        </td>
                        <td className="text-foreground px-5 py-3 text-right text-xs font-semibold tabular-nums">
                          {formatNumber(s.followers)}
                        </td>
                        <td className="text-muted-foreground px-5 py-3 text-right text-xs tabular-nums">
                          {formatNumber(s.posts)}
                        </td>
                        <td className="text-muted-foreground px-5 py-3 text-right text-xs tabular-nums">
                          {formatNumber(s.views)}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => void deleteSnapshot(s.id)}
                            className="text-muted-foreground hover:text-destructive rounded p-1 transition-colors"
                            title="Supprimer"
                            aria-label="Supprimer ce snapshot"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && snapshots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <TrendingUp className="text-muted-foreground/30 mb-4 h-14 w-14" aria-hidden="true" />
            <p className="text-foreground text-base font-semibold">Aucun snapshot enregistré</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-center text-sm">
              Ajoutez vos premiers chiffres pour commencer à suivre l&apos;évolution de vos réseaux sociaux.
            </p>
            <button
              onClick={() => setAddOpen(true)}
              className="bg-primary text-primary-foreground mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ajouter un snapshot
            </button>
          </div>
        )}
      </div>

      {addOpen && (
        <AddModal
          onClose={() => setAddOpen(false)}
          onSave={addSnapshot}
        />
      )}
    </div>
  );
}
