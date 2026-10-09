"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, TrendingUp, Users, FileText, Eye, RefreshCw, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
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
import {
  PLATFORMS,
  SocialPlatform,
  SocialSnapshotInput,
  useSocial,
  YouTubeConfig,
  loadYouTubeConfig,
  saveYouTubeConfig,
  clearYouTubeConfig,
  fetchYouTubeStats,
  MetaConfig,
  loadMetaConfig,
  saveMetaConfig,
  clearMetaConfig,
  fetchFacebookStats,
  fetchInstagramStats,
  detectInstagramAccount,
} from "@/lib/social";

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

// --- Meta (Facebook + Instagram) config modal ---
interface MetaModalProps {
  initial: MetaConfig | null;
  onSave: (config: MetaConfig) => void;
  onDisconnect: () => void;
  onClose: () => void;
}

function MetaModal({ initial, onSave, onDisconnect, onClose }: MetaModalProps) {
  const [pageToken, setPageToken] = useState(initial?.pageToken ?? "");
  const [pageId, setPageId] = useState(initial?.pageId ?? "");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!pageToken.trim() || !pageId.trim()) return;
    setTesting(true);
    setError(null);
    try {
      const fbStats = await fetchFacebookStats({ pageToken: pageToken.trim(), pageId: pageId.trim() });
      const ig = await detectInstagramAccount({ pageToken: pageToken.trim(), pageId: pageId.trim() });
      onSave({
        pageToken: pageToken.trim(),
        pageId: pageId.trim(),
        pageName: fbStats.pageName,
        igAccountId: ig?.id,
        igUsername: ig?.username,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-[10px] font-bold text-white shadow-sm">fb</div>
            <h2 className="text-foreground text-lg font-bold">Connecter Facebook &amp; Instagram</h2>
          </div>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
            <p className="font-semibold mb-1.5">Comment obtenir un token de Page permanent</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400">
              <li>Va sur <span className="font-mono">developers.facebook.com</span> → crée une app (type Entreprise)</li>
              <li>Ouvre le <span className="font-mono">Graph API Explorer</span> → sélectionne ton app</li>
              <li>Clique sur <strong>Get Token</strong> → coche : <span className="font-mono">pages_show_list</span>, <span className="font-mono">pages_read_engagement</span>, <span className="font-mono">instagram_basic</span></li>
              <li>Clique <strong>(i)</strong> sur le token → <strong>Open in Access Token Tool</strong> → <strong>Extend Access Token</strong> (60 jours)</li>
              <li>Reviens dans l'Explorer avec ce token → requête <span className="font-mono">me/accounts</span> → copie le <span className="font-mono">access_token</span> de ta Page (ce token est permanent)</li>
              <li>L'ID de page se trouve aussi dans <span className="font-mono">me/accounts</span> → champ <span className="font-mono">id</span></li>
            </ol>
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">ID de la page Facebook</label>
            <input
              type="text"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="Ex : 123456789012345"
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">Token de Page (permanent)</label>
            <input
              type="password"
              value={pageToken}
              onChange={(e) => setPageToken(e.target.value)}
              placeholder="EAAxxxxx..."
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-muted-foreground mt-1 text-[10px]">Instagram est détecté automatiquement si ta page est liée à un compte Business/Creator</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <div className="border-border flex items-center justify-between border-t px-6 py-4">
          {initial && (
            <button type="button" onClick={onDisconnect} className="text-xs text-red-500 underline underline-offset-2 hover:text-red-700">
              Déconnecter
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="border-border bg-card text-foreground rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
              Annuler
            </button>
            <button
              type="button"
              disabled={testing || !pageToken.trim() || !pageId.trim()}
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {testing ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Test en cours…</> : "Tester et connecter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- YouTube config modal ---
interface YTModalProps {
  initial: YouTubeConfig | null;
  onSave: (config: YouTubeConfig) => void;
  onDisconnect: () => void;
  onClose: () => void;
}

function YouTubeModal({ initial, onSave, onDisconnect, onClose }: YTModalProps) {
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [channelInput, setChannelInput] = useState(initial?.channelInput ?? "");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim() || !channelInput.trim()) return;
    setTesting(true);
    setError(null);
    try {
      const stats = await fetchYouTubeStats({ apiKey: apiKey.trim(), channelInput: channelInput.trim() });
      onSave({ apiKey: apiKey.trim(), channelInput: channelInput.trim(), channelTitle: stats.channelTitle });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-[10px] font-bold text-white shadow-sm">YT</div>
            <h2 className="text-foreground text-lg font-bold">Connecter YouTube</h2>
          </div>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
            <p className="font-semibold mb-1">Comment obtenir une clé API YouTube</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
              <li>Aller sur console.cloud.google.com</li>
              <li>Créer un projet → Activer "YouTube Data API v3"</li>
              <li>Identifiants → Créer une clé API</li>
              <li>Restreindre la clé à cette API (optionnel mais recommandé)</li>
            </ol>
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">Clé API Google</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">Handle ou ID de ta chaîne</label>
            <input
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              placeholder="@NetforceBoxing ou UCxxxx..."
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <p className="text-muted-foreground mt-1 text-[10px]">Trouve l'ID sur studio.youtube.com → Paramètres → Informations sur la chaîne</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <div className="border-border flex items-center justify-between border-t px-6 py-4">
          {initial && (
            <button type="button" onClick={onDisconnect} className="text-xs text-red-500 underline underline-offset-2 hover:text-red-700">
              Déconnecter
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="border-border bg-card text-foreground rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
              Annuler
            </button>
            <button
              type="button"
              disabled={testing || !apiKey.trim() || !channelInput.trim()}
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {testing ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Test en cours…</> : "Tester et connecter"}
            </button>
          </div>
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
  const [ytModalOpen, setYtModalOpen] = useState(false);
  const [ytConfig, setYtConfig] = useState<YouTubeConfig | null>(null);
  const [ytSyncing, setYtSyncing] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytLastSync, setYtLastSync] = useState<string | null>(null);
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [metaConfig, setMetaConfig] = useState<MetaConfig | null>(null);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLastSync, setMetaLastSync] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<"followers" | "views">("followers");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SocialPlatform>>(
    new Set(PLATFORMS.map((p) => p.name)),
  );

  useEffect(() => {
    setYtConfig(loadYouTubeConfig());
    setMetaConfig(loadMetaConfig());
  }, []);

  const handleMetaSave = (config: MetaConfig) => {
    saveMetaConfig(config);
    setMetaConfig(config);
    setMetaModalOpen(false);
  };

  const handleMetaDisconnect = () => {
    clearMetaConfig();
    setMetaConfig(null);
    setMetaModalOpen(false);
  };

  const syncMeta = async () => {
    if (!metaConfig) return;
    setMetaSyncing(true);
    setMetaError(null);
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      const [fbStats, igStats] = await Promise.allSettled([
        fetchFacebookStats(metaConfig),
        metaConfig.igAccountId ? fetchInstagramStats(metaConfig) : Promise.reject(new Error("no ig")),
      ]);
      if (fbStats.status === "fulfilled") {
        await addSnapshot({ platform: "Facebook", followers: fbStats.value.followers, posts: 0, views: 0, date });
      }
      if (igStats.status === "fulfilled") {
        await addSnapshot({ platform: "Instagram", followers: igStats.value.followers, posts: igStats.value.mediaCount, views: 0, date });
      }
      if (fbStats.status === "rejected" && igStats.status === "rejected") {
        throw fbStats.reason as Error;
      }
      setMetaLastSync(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setMetaSyncing(false);
    }
  };

  const handleYtSave = (config: YouTubeConfig) => {
    saveYouTubeConfig(config);
    setYtConfig(config);
    setYtModalOpen(false);
  };

  const handleYtDisconnect = () => {
    clearYouTubeConfig();
    setYtConfig(null);
    setYtModalOpen(false);
  };

  const syncYouTube = async () => {
    if (!ytConfig) return;
    setYtSyncing(true);
    setYtError(null);
    try {
      const stats = await fetchYouTubeStats(ytConfig);
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await addSnapshot({ platform: "YouTube", followers: stats.subscribers, posts: stats.videos, views: stats.views, date });
      setYtLastSync(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setYtError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setYtSyncing(false);
    }
  };

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
        {/* Connexions automatiques */}
        <div className="mb-6">
          <h2 className="text-foreground mb-3 text-sm font-semibold">Connexions</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* YouTube */}
            <div className="border-border bg-card flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-xs font-bold text-white shadow-sm">YT</div>
                <div>
                  <p className="text-foreground text-sm font-semibold">YouTube</p>
                  {ytConfig ? (
                    <p className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[10px] font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      {ytConfig.channelTitle ?? ytConfig.channelInput}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-[10px]">Non connecté</p>
                  )}
                  {ytLastSync && <p className="text-muted-foreground text-[10px]">Sync à {ytLastSync}</p>}
                  {ytError && (
                    <p className="text-red-500 flex items-center gap-1 text-[10px]">
                      <AlertCircle className="h-3 w-3" />{ytError}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {ytConfig && (
                  <button
                    onClick={syncYouTube}
                    disabled={ytSyncing}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-400"
                    title="Synchroniser maintenant"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${ytSyncing ? "animate-spin" : ""}`} />
                    {ytSyncing ? "Sync…" : "Sync"}
                  </button>
                )}
                <button
                  onClick={() => setYtModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {ytConfig ? "Modifier" : "Configurer"}
                </button>
              </div>
            </div>

            {/* Facebook + Instagram (same Meta token) */}
            <div className="border-border bg-card flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex shrink-0 flex-col gap-1">
                  <div className="flex h-5 w-10 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-blue-600 text-[9px] font-bold text-white shadow-sm">fb</div>
                  <div className="flex h-5 w-10 items-center justify-center rounded-md bg-gradient-to-br from-pink-500 to-orange-400 text-[9px] font-bold text-white shadow-sm">IG</div>
                </div>
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-semibold">Facebook &amp; Instagram</p>
                  {metaConfig ? (
                    <p className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[10px] font-medium truncate">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      {metaConfig.pageName ?? metaConfig.pageId}
                      {metaConfig.igUsername && ` · @${metaConfig.igUsername}`}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-[10px]">Non connecté</p>
                  )}
                  {metaLastSync && <p className="text-muted-foreground text-[10px]">Sync à {metaLastSync}</p>}
                  {metaError && (
                    <p className="text-red-500 flex items-center gap-1 text-[10px]">
                      <AlertCircle className="h-3 w-3 shrink-0" />{metaError}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {metaConfig && (
                  <button
                    onClick={syncMeta}
                    disabled={metaSyncing}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-950/30 dark:text-blue-400"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${metaSyncing ? "animate-spin" : ""}`} />
                    {metaSyncing ? "Sync…" : "Sync"}
                  </button>
                )}
                <button
                  onClick={() => setMetaModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {metaConfig ? "Modifier" : "Configurer"}
                </button>
              </div>
            </div>

            {/* TikTok — coming soon */}
            <div className="border-border bg-card/50 flex items-center gap-3 rounded-2xl border border-dashed p-4 opacity-60">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 text-xs font-bold text-white shadow-sm">TT</div>
              <div>
                <p className="text-foreground text-sm font-semibold">TikTok</p>
                <p className="text-muted-foreground text-[10px]">Prochainement</p>
              </div>
            </div>
          </div>
        </div>

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

      {ytModalOpen && (
        <YouTubeModal
          initial={ytConfig}
          onSave={handleYtSave}
          onDisconnect={handleYtDisconnect}
          onClose={() => setYtModalOpen(false)}
        />
      )}

      {metaModalOpen && (
        <MetaModal
          initial={metaConfig}
          onSave={handleMetaSave}
          onDisconnect={handleMetaDisconnect}
          onClose={() => setMetaModalOpen(false)}
        />
      )}
    </div>
  );
}
