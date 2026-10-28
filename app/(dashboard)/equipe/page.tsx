"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Monitor,
  Clock,
  Wifi,
  WifiOff,
  Mail,
  Video,
  FileText,
  Globe,
  ChevronDown,
  ChevronUp,
  Users,
  TrendingUp,
  Palette,
  RefreshCw,
} from "lucide-react";
import { getApps, initializeApp } from "firebase/app";
import { collection, getFirestore, onSnapshot, query, where } from "firebase/firestore";

const rapportConfig = {
  apiKey: "AIzaSyABOcipg9S2LNSx-MBYa66xYBJA2E2MYdM",
  authDomain: "netforce-38edf.firebaseapp.com",
  projectId: "netforce-38edf",
  storageBucket: "netforce-38edf.firebasestorage.app",
  messagingSenderId: "562828872246",
  appId: "1:562828872246:web:09b24b68e4c879f182a697",
};

function getRapportApp() {
  return getApps().find((a) => a.name === "rapport") ?? initializeApp(rapportConfig, "rapport");
}

interface OlMeeting {
  title: string;
  start: string;
  duration: number;
}

interface DocEntry {
  name: string;
  app: string;
  duration: number;
}

interface ActivityDoc {
  userId: string;
  date: string;
  updatedAt: string;
  sessions: Record<string, number>;
  urls?: Record<string, number>;
  documents?: DocEntry[];
  idle?: number;
  active?: number;
  outlook?: {
    emailsSent: number;
    emailsReceived: number;
    meetings: OlMeeting[];
  };
  canva?: {
    designs: CanvaDesign[];
    exportsCreated?: number;
  };
}

interface CanvaDesign {
  id?: string;
  name: string;
  editedAt: string;
  createdAt?: string;
  isNew?: boolean;
  thumbnail?: string;
  editUrl?: string;
  viewUrl?: string;
  pageCount?: number;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Le tracker ne voit que le titre de fenêtre : on rattache à un design les fenêtres dont le titre contient son nom.
function secondsOnDesign(name: string, docs: DocEntry[]): number {
  const n = name.trim().toLowerCase();
  if (n.length < 3) return 0;
  return docs.filter((d) => d.name.toLowerCase().includes(n)).reduce((s, d) => s + d.duration, 0);
}

function CanvaDetails({ doc }: { doc: ActivityDoc }) {
  const designs = [...(doc.canva?.designs ?? [])].sort((a, b) => b.editedAt.localeCompare(a.editedAt));
  const docs = doc.documents ?? [];
  const appSecs = Object.entries(doc.sessions)
    .filter(([app]) => app.toLowerCase().includes("canva"))
    .reduce((s, [, v]) => s + v, 0);
  const webSecs = Object.entries(doc.urls ?? {})
    .filter(([dom]) => dom.includes("canva.com"))
    .reduce((s, [, v]) => s + v, 0);
  const created = designs.filter((d) => d.isNew).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-muted rounded-lg p-2">
          <p className="text-muted-foreground">Temps sur Canva</p>
          <p className="text-foreground text-base font-bold">{appSecs + webSecs > 0 ? fmt(appSecs + webSecs) : "—"}</p>
        </div>
        <div className="bg-muted rounded-lg p-2">
          <p className="text-muted-foreground">Créés</p>
          <p className="text-foreground text-base font-bold">{created}</p>
        </div>
        <div className="bg-muted rounded-lg p-2">
          <p className="text-muted-foreground">Modifiés</p>
          <p className="text-foreground text-base font-bold">{designs.length - created}</p>
        </div>
      </div>
      {designs.length === 0 ? (
        <p className="text-muted-foreground text-xs italic">Aucun design modifié aujourd&apos;hui</p>
      ) : (
        <ul className="space-y-2">
          {designs.map((d, i) => {
            const spent = secondsOnDesign(d.name, docs);
            const link = d.editUrl ?? d.viewUrl;
            return (
              <li key={d.id || i} className="border-border flex items-center gap-3 rounded-lg border p-2">
                <div className="bg-muted flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md">
                  {d.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <Palette className="text-muted-foreground h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-foreground truncate text-xs font-semibold">{d.name}</p>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${d.isNew ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"}`}
                    >
                      {d.isNew ? "Créé" : "Modifié"}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    {d.isNew && d.createdAt ? `Créé à ${hhmm(d.createdAt)} · ` : ""}
                    Dernière modif. {hhmm(d.editedAt)}
                    {d.pageCount ? ` · ${d.pageCount} page${d.pageCount > 1 ? "s" : ""}` : ""}
                    {spent > 0 ? ` · ${fmt(spent)} passé` : ""}
                  </p>
                </div>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:bg-muted shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
                  >
                    Ouvrir
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

function isOnline(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < 3 * 60 * 1000;
}

const APP_ICONS: Record<string, string> = {
  Blender: "🎨", Figma: "🎨", Canva: "🎨", Photoshop: "🖼️", "Adobe Photoshop": "🖼️",
  Illustrator: "🖼️", "Adobe Illustrator": "🖼️", "After Effects": "🎬", Premiere: "🎬",
  Chrome: "🌐", Safari: "🌐", Firefox: "🌐", Arc: "🌐",
  "Microsoft Outlook": "📧", Mail: "📧", Outlook: "📧",
  "Microsoft Word": "📝", Word: "📝", Pages: "📝",
  "Microsoft Excel": "📊", Excel: "📊", Numbers: "📊",
  "Microsoft PowerPoint": "📊", PowerPoint: "📊", Keynote: "📊",
  Slack: "💬", Discord: "💬", Teams: "💬", WhatsApp: "💬", Telegram: "💬",
  Terminal: "💻", iTerm2: "💻", "Visual Studio Code": "💻", VSCode: "💻",
  Cursor: "💻", cursor: "💻", Xcode: "💻",
  Zoom: "📹", FaceTime: "📹",
  Notion: "📋", Obsidian: "📋",
};

const URL_ICONS: Record<string, string> = {
  "canva.com": "🎨",
  "figma.com": "🎨",
  "notion.so": "📋",
  "gmail.com": "📧",
  "outlook.live.com": "📧",
  "office.com": "📊",
  "docs.google.com": "📝",
  "sheets.google.com": "📊",
  "slides.google.com": "📊",
  "drive.google.com": "☁️",
  "slack.com": "💬",
  "teams.microsoft.com": "💬",
  "zoom.us": "📹",
  "github.com": "💻",
  "youtube.com": "📺",
  "linkedin.com": "💼",
};

function appIcon(name: string): string { return APP_ICONS[name] ?? "📱"; }
function urlIcon(domain: string): string {
  const key = Object.keys(URL_ICONS).find((k) => domain.includes(k));
  return key ? URL_ICONS[key] : "🌐";
}

function shortDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── Mini bar chart ────────────────────────────────────────────

function AppBars({ sessions }: { sessions: Record<string, number> }) {
  const sorted = Object.entries(sessions).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  if (!sorted.length) return <p className="text-muted-foreground text-xs">Aucune activité</p>;
  return (
    <div className="space-y-2">
      {sorted.map(([app, secs]) => (
        <div key={app}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="text-foreground flex items-center gap-1.5">
              <span className="text-base">{appIcon(app)}</span>
              <span className="max-w-[160px] truncate font-medium">{app}</span>
            </span>
            <span className="text-muted-foreground shrink-0 ml-2">{fmt(secs)}</span>
          </div>
          <div className="bg-muted h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${Math.round((secs / total) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section bloc ──────────────────────────────────────────────

function Section({
  icon,
  title,
  badge,
  children,
  empty,
  emptyMsg,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children?: React.ReactNode;
  empty?: boolean;
  emptyMsg?: string;
}) {
  return (
    <div className="border-border border-t pt-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-foreground text-xs font-semibold uppercase tracking-wide">{title}</span>
        {badge && (
          <span className="bg-primary/10 text-primary ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold">{badge}</span>
        )}
      </div>
      {empty ? (
        <p className="text-muted-foreground text-xs italic">{emptyMsg ?? "Aucune donnée"}</p>
      ) : (
        children
      )}
    </div>
  );
}

// ── Carte utilisateur ─────────────────────────────────────────

function UserCard({ doc }: { doc: ActivityDoc }) {
  const [expanded, setExpanded] = useState(false);
  const online = isOnline(doc.updatedAt);
  const totalSecs = Object.values(doc.sessions).reduce((a, b) => a + b, 0);
  const topApp = Object.entries(doc.sessions).sort((a, b) => b[1] - a[1])[0];
  const updatedDate = new Date(doc.updatedAt);
  const minAgo = Math.floor((Date.now() - updatedDate.getTime()) / 60000);

  const activeSecs = doc.active ?? totalSecs;
  const idleSecs = doc.idle ?? 0;

  const topDomains = useMemo(
    () => Object.entries(doc.urls ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [doc.urls],
  );
  const topDocs = useMemo(
    () => [...(doc.documents ?? [])].sort((a, b) => b.duration - a.duration).slice(0, 4),
    [doc.documents],
  );
  const urlTotal = topDomains.reduce((s, [, v]) => s + v, 0) || 1;

  const meetingTotal = (doc.outlook?.meetings ?? []).reduce((s, m) => s + m.duration, 0);

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold">
              {doc.userId.slice(0, 2).toUpperCase()}
            </div>
            <span
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${online ? "bg-green-500" : "bg-gray-300"}`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-foreground text-sm font-bold truncate">{doc.userId}</p>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              {online
                ? topApp
                  ? `${appIcon(topApp[0])} ${topApp[0]}`
                  : "En ligne"
                : `Hors ligne · sync il y a ${minAgo}min`}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 shrink-0">
          <div className="text-right">
            <p className="text-foreground text-lg font-bold">{fmt(activeSecs)}</p>
            {idleSecs > 0 && (
              <p className="text-muted-foreground text-[10px]">{fmt(idleSecs)} inactif</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:bg-muted mt-0.5 rounded-lg p-1.5 transition-colors"
            aria-label={expanded ? "Réduire" : "Développer"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Apps (always visible) */}
      <div className="border-border border-t px-4 py-3">
        <AppBars sessions={doc.sessions} />
      </div>

      {/* Expanded sections */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Documents */}
          <Section
            icon={<FileText className="h-3.5 w-3.5" />}
            title="Documents"
            badge={topDocs.length ? String(topDocs.length) : undefined}
            empty={topDocs.length === 0}
            emptyMsg="Pas encore de données — mettez à jour le tracker"
          >
            <div className="space-y-1.5">
              {topDocs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-base shrink-0">{appIcon(d.app)}</span>
                  <span className="text-foreground truncate flex-1 font-medium">{d.name}</span>
                  <span className="text-muted-foreground shrink-0">{fmt(d.duration)}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* URLs */}
          <Section
            icon={<Globe className="h-3.5 w-3.5" />}
            title="Sites web"
            badge={topDomains.length ? String(topDomains.length) : undefined}
            empty={topDomains.length === 0}
            emptyMsg="Pas encore de données — mettez à jour le tracker"
          >
            <div className="space-y-1.5">
              {topDomains.map(([url, secs]) => (
                <div key={url}>
                  <div className="mb-0.5 flex items-center gap-2 text-xs">
                    <span className="text-base shrink-0">{urlIcon(url)}</span>
                    <span className="text-foreground truncate flex-1">{shortDomain(url)}</span>
                    <span className="text-muted-foreground shrink-0">{fmt(secs)}</span>
                  </div>
                  <div className="bg-muted h-1 rounded-full overflow-hidden">
                    <div
                      className="bg-primary/60 h-full rounded-full"
                      style={{ width: `${Math.round((secs / urlTotal) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Outlook */}
          <Section
            icon={<Mail className="h-3.5 w-3.5" />}
            title="Outlook"
            badge={
              doc.outlook
                ? `${doc.outlook.emailsSent} envoyés · ${doc.outlook.meetings.length} réunions`
                : undefined
            }
            empty={!doc.outlook}
            emptyMsg="Non connecté — configurez Outlook dans le tracker"
          >
            {doc.outlook && (
              <div className="space-y-2">
                <div className="flex gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Envoyés</span>
                    <p className="text-foreground font-bold text-base leading-tight">{doc.outlook.emailsSent}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reçus</span>
                    <p className="text-foreground font-bold text-base leading-tight">{doc.outlook.emailsReceived}</p>
                  </div>
                  {meetingTotal > 0 && (
                    <div>
                      <span className="text-muted-foreground">Réunions</span>
                      <p className="text-foreground font-bold text-base leading-tight">{fmt(meetingTotal * 60)}</p>
                    </div>
                  )}
                </div>
                {doc.outlook.meetings.length > 0 && (
                  <div className="space-y-1">
                    {doc.outlook.meetings.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Video className="text-muted-foreground h-3 w-3 shrink-0" />
                        <span className="text-foreground flex-1 truncate">{m.title}</span>
                        <span className="text-muted-foreground shrink-0">{m.start} · {m.duration}min</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Canva */}
          <Section
            icon={<Palette className="h-3.5 w-3.5" />}
            title="Canva"
            badge={doc.canva ? `${doc.canva.designs.length} designs` : undefined}
            empty={!doc.canva}
            emptyMsg="Non connecté — configurez Canva dans le tracker"
          >
            {doc.canva && <CanvaDetails doc={doc} />}
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Vue semaine ───────────────────────────────────────────────

function WeekView({ allDocs }: { allDocs: ActivityDoc[] }) {
  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, ActivityDoc[]>();
    for (const d of allDocs) {
      const arr = map.get(d.date) ?? [];
      arr.push(d);
      map.set(d.date, arr);
    }
    return map;
  }, [allDocs]);

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const docs = byDay.get(day) ?? [];
        const total = docs.reduce(
          (s, d) => s + Object.values(d.sessions).reduce((a, b) => a + b, 0),
          0,
        );
        const label = new Date(day + "T12:00:00").toLocaleDateString("fr-FR", {
          weekday: "short", day: "numeric", month: "short",
        });
        const isToday = day === new Date().toISOString().slice(0, 10);
        return (
          <div
            key={day}
            className={`border-border bg-card rounded-xl border p-4 ${isToday ? "ring-2 ring-primary/30" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-bold capitalize ${isToday ? "text-primary" : "text-foreground"}`}>
                  {label}
                  {isToday && <span className="ml-2 text-[10px] font-semibold uppercase text-primary">Aujourd&apos;hui</span>}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {docs.length} personne{docs.length !== 1 ? "s" : ""} actives
                </p>
              </div>
              {total > 0 ? (
                <p className="text-foreground text-base font-bold">{fmt(total)}</p>
              ) : (
                <p className="text-muted-foreground text-sm">—</p>
              )}
            </div>
            {docs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {docs.map((d) => {
                  const t = Object.values(d.sessions).reduce((a, b) => a + b, 0);
                  return (
                    <div key={d.userId} className="bg-muted flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs">
                      <span className="text-foreground font-medium">{d.userId.split(/[\s_@]/)[0]}</span>
                      <span className="text-muted-foreground">{fmt(t)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────

type Tab = "today" | "week";

export default function EquipePage() {
  const [todayDocs, setTodayDocs] = useState<ActivityDoc[]>([]);
  const [weekDocs, setWeekDocs] = useState<ActivityDoc[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [tab, setTab] = useState<Tab>("today");

  const today = new Date().toISOString().slice(0, 10);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    const db = getFirestore(getRapportApp());
    const unsub = onSnapshot(
      query(collection(db, "activity_tracker"), where("date", "==", today)),
      (snap) => {
        setTodayDocs(snap.docs.map((d) => d.data() as ActivityDoc));
        setLoadingToday(false);
      },
    );
    return unsub;
  }, [today]);

  useEffect(() => {
    const db = getFirestore(getRapportApp());
    const unsub = onSnapshot(
      query(
        collection(db, "activity_tracker"),
        where("date", ">=", weekStart),
        where("date", "<=", today),
      ),
      (snap) => {
        setWeekDocs(snap.docs.map((d) => d.data() as ActivityDoc));
        setLoadingWeek(false);
      },
    );
    return unsub;
  }, [today, weekStart]);

  const online = todayDocs.filter((d) => isOnline(d.updatedAt)).length;
  const totalSecs = todayDocs.reduce(
    (s, d) => s + Object.values(d.sessions).reduce((a, b) => a + b, 0),
    0,
  );
  const totalMeetings = todayDocs.reduce(
    (s, d) => s + (d.outlook?.meetings.length ?? 0),
    0,
  );
  const totalDesigns = todayDocs.reduce(
    (s, d) => s + (d.canva?.designs.length ?? 0),
    0,
  );

  const loading = tab === "today" ? loadingToday : loadingWeek;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-foreground text-xl font-bold">Équipe — activité</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
          </div>
          {online > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {online} en ligne
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: <Users className="h-4 w-4" />, label: "Actifs aujourd'hui", value: String(todayDocs.length), color: "text-primary" },
            { icon: <Clock className="h-4 w-4" />, label: "Heures cumulées", value: fmt(totalSecs), color: "text-foreground" },
            { icon: <Video className="h-4 w-4" />, label: "Réunions Outlook", value: totalMeetings > 0 ? String(totalMeetings) : "—", color: "text-blue-600" },
            { icon: <Palette className="h-4 w-4" />, label: "Créations Canva", value: totalDesigns > 0 ? String(totalDesigns) : "—", color: "text-violet-600" },
          ].map(({ icon, label, value, color }) => (
            <div key={label} className="border-border bg-card rounded-xl border p-3">
              <div className={`mb-1 ${color}`}>{icon}</div>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-muted-foreground text-[10px] font-semibold uppercase leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-2">
          {(["today", "week"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "rounded-lg px-4 py-2 text-sm font-semibold transition-colors " +
                (tab === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:bg-muted border")
              }
            >
              {t === "today" ? "Aujourd'hui" : "Cette semaine"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-muted-foreground py-16 text-center text-sm">Chargement…</div>
      ) : tab === "today" ? (
        <>
          {todayDocs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {todayDocs
                .sort((a, b) => {
                  const aO = isOnline(a.updatedAt) ? 0 : 1;
                  const bO = isOnline(b.updatedAt) ? 0 : 1;
                  if (aO !== bO) return aO - bO;
                  const aT = Object.values(a.sessions).reduce((s, v) => s + v, 0);
                  const bT = Object.values(b.sessions).reduce((s, v) => s + v, 0);
                  return bT - aT;
                })
                .map((doc) => (
                  <UserCard key={doc.userId} doc={doc} />
                ))}
            </div>
          )}
        </>
      ) : (
        <WeekView allDocs={weekDocs} />
      )}

      {/* Setup guide */}
      <SetupGuide />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <Monitor className="text-muted-foreground/30 mx-auto mb-3 h-10 w-10" />
      <p className="text-foreground text-sm font-medium">Aucun tracker actif aujourd&apos;hui</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Lance{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">
          python3 netforce_tracker.py --setup
        </code>{" "}
        sur chaque PC
      </p>
    </div>
  );
}

function SetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-border bg-card text-foreground hover:bg-muted flex w-full items-center gap-2 rounded-xl border p-4 text-sm font-semibold transition-colors"
      >
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-left">Guide d&apos;installation et intégrations</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-border bg-card rounded-b-xl border border-t-0 px-5 pb-5 pt-4 space-y-4 text-sm">
          <div>
            <p className="text-foreground font-semibold mb-1">Installation de base</p>
            <div className="bg-muted rounded-lg p-3 font-mono text-xs space-y-1">
              <p>pip3 install requests</p>
              <p>python3 netforce_tracker.py --setup</p>
              <p>python3 netforce_tracker.py</p>
            </div>
            <p className="text-muted-foreground text-xs mt-1">Compatible Mac et Windows. Suit les apps actives et les fenêtres ouvertes.</p>
          </div>
          <div>
            <p className="text-foreground font-semibold mb-1">Activer le suivi des URLs et documents</p>
            <p className="text-muted-foreground text-xs">Mis à jour automatiquement dans le tracker v2. Relance le tracker après la mise à jour.</p>
          </div>
          <div>
            <p className="text-foreground font-semibold mb-1">Intégration Outlook</p>
            <p className="text-muted-foreground text-xs">
              Nécessite l&apos;ID d&apos;une application enregistrée sur portal.azure.com (flux client public activé, permissions
              Calendars.Read et Mail.Read). Relance <code className="bg-muted rounded px-1">--setup</code>, réponds « o » à Outlook et colle l&apos;ID.
              Affiche les réunions du calendrier et le nombre d&apos;emails envoyés/reçus.
            </p>
          </div>
          <div>
            <p className="text-foreground font-semibold mb-1">Intégration Canva</p>
            <p className="text-muted-foreground text-xs">
              Crée une intégration sur canva.com/developers (scope design:meta:read, URL de redirection
              http://127.0.0.1:8765/callback). Relance <code className="bg-muted rounded px-1">--setup</code>, réponds « o » à Canva,
              colle le Client ID et le secret, puis autorise l&apos;accès dans le navigateur.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
