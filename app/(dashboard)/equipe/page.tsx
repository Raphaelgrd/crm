"use client";

import { useEffect, useState } from "react";
import { Monitor, Clock, Wifi, WifiOff } from "lucide-react";
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

interface ActivityDoc {
  userId: string;
  date: string;
  updatedAt: string;
  sessions: Record<string, number>; // app → secondes
}

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

function isOnline(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < 3 * 60 * 1000; // actif si sync < 3min
}

const APP_ICONS: Record<string, string> = {
  Blender: "🎨", Figma: "🎨", Canva: "🎨", Photoshop: "🖼️", "Adobe Photoshop": "🖼️",
  Chrome: "🌐", Safari: "🌐", Firefox: "🌐", Arc: "🌐",
  "Microsoft Outlook": "📧", Mail: "📧", Outlook: "📧",
  "Microsoft Word": "📝", Word: "📝", Pages: "📝",
  "Microsoft Excel": "📊", Excel: "📊", Numbers: "📊",
  Slack: "💬", Discord: "💬", Teams: "💬", WhatsApp: "💬",
  Terminal: "💻", iTerm2: "💻", "Visual Studio Code": "💻", VSCode: "💻",
  Xcode: "💻", cursor: "💻", Cursor: "💻",
  Zoom: "📹", FaceTime: "📹",
};

function appIcon(name: string): string {
  return APP_ICONS[name] ?? "📱";
}

function TopApps({ sessions }: { sessions: Record<string, number> }) {
  const sorted = Object.entries(sessions).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  if (!sorted.length) return <p className="text-muted-foreground text-xs">Aucune activité</p>;
  return (
    <div className="space-y-1.5">
      {sorted.map(([app, secs]) => (
        <div key={app}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="text-foreground flex items-center gap-1">
              <span>{appIcon(app)}</span>
              <span className="truncate max-w-[120px]">{app}</span>
            </span>
            <span className="text-muted-foreground">{fmt(secs)}</span>
          </div>
          <div className="bg-muted h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${Math.round((secs / total) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EquipePage() {
  const [docs, setDocs] = useState<ActivityDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const db = getFirestore(getRapportApp());
    const q = query(collection(db, "activity_tracker"), where("date", "==", today));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => d.data() as ActivityDoc);
      setDocs(items);
      setLoading(false);
    });
    return unsub;
  }, [today]);

  const totalToday = docs.reduce((s, d) => s + Object.values(d.sessions).reduce((a, b) => a + b, 0), 0);
  const online = docs.filter((d) => isOnline(d.updatedAt)).length;

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-xl font-bold">Équipe — activité du jour</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Wifi className="h-4 w-4 text-green-500" />
            <span>{online} en ligne</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span>Total {fmt(totalToday)}</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-muted-foreground py-16 text-center text-sm">Chargement…</div>
      )}

      {!loading && docs.length === 0 && (
        <div className="py-16 text-center">
          <Monitor className="text-muted-foreground/30 mx-auto mb-3 h-10 w-10" />
          <p className="text-foreground text-sm font-medium">Aucun tracker actif aujourd&apos;hui</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Lance <code className="bg-muted rounded px-1 py-0.5">python3 netforce_tracker.py --setup</code> sur chaque PC
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc) => {
          const online = isOnline(doc.updatedAt);
          const totalSecs = Object.values(doc.sessions).reduce((a, b) => a + b, 0);
          const topApp = Object.entries(doc.sessions).sort((a, b) => b[1] - a[1])[0];
          const updatedDate = new Date(doc.updatedAt);
          const minAgo = Math.floor((Date.now() - updatedDate.getTime()) / 60000);

          return (
            <div key={doc.userId} className="bg-card border-border rounded-xl border p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="text-foreground text-sm font-semibold">{doc.userId}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {online ? (
                      <>En ligne · {topApp ? `${appIcon(topApp[0])} ${topApp[0]}` : "—"}</>
                    ) : (
                      <>Hors ligne · sync il y a {minAgo}min</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-foreground text-lg font-bold">{fmt(totalSecs)}</p>
                  <p className="text-muted-foreground text-xs">aujourd&apos;hui</p>
                </div>
              </div>
              <TopApps sessions={doc.sessions} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
