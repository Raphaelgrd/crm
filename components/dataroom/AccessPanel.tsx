"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Globe, Lock, Trash2, UserPlus } from "lucide-react";
import { authFetch } from "@/lib/rapport";
import { useContacts, contactFullName } from "@/lib/contacts";

// Panneau « Utilisateurs ayant accès » d'une Data Room (admins) : invités extérieurs regroupés par échéance,
// durée modifiable, accès retirable, et membres de l'équipe qui voient la Data Room.

interface Share {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  activatedAt: string | null;
  lastOpenedAt: string | null;
  opens: number;
  status: "active" | "expired" | "revoked";
}
interface Member {
  email: string;
  name: string;
  isAdmin: boolean;
  member: boolean;
  isBot: boolean;
}

const DURATIONS = [1, 3, 7, 14, 30, 90];
const DAY = 86_400_000;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);

export function AccessPanel({
  folder,
  onAdd,
  refreshKey,
}: {
  folder: { id: string; name: string; visibility: "public" | "private"; sharedWith: string[] };
  onAdd: () => void;
  refreshKey: number;
}) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(false);
  const { contacts } = useContacts();

  const nameOf = useMemo(() => {
    const map = new Map(contacts.filter((c) => c.email).map((c) => [c.email.toLowerCase(), contactFullName(c)]));
    return (email: string) => map.get(email.toLowerCase()) || email.split("@")[0];
  }, [contacts]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, t] = await Promise.all([authFetch(`/api/dataroom/folders/${folder.id}/shares?all=1`), authFetch("/api/team")]);
      const sj = (await s.json()) as { shares?: Share[]; error?: string };
      if (!s.ok || !sj.shares) throw new Error(sj.error ?? `Erreur ${s.status}`);
      setShares(sj.shares);
      if (t.ok) setTeam(((await t.json()) as { members?: Member[] }).members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [folder.id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const act = async (key: string, run: () => Promise<Response>) => {
    setBusy(key);
    setError("");
    try {
      const r = await run();
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Erreur ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const setDuration = (s: Share, days: number) =>
    act(s.id, () =>
      authFetch(`/api/dataroom/shares/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) }),
    );
  const revoke = (s: Share) => {
    if (!window.confirm(`Retirer l'accès de ${s.email} à « ${folder.name} » ? Son lien ne fonctionnera plus.`)) return;
    void act(s.id, () => authFetch(`/api/dataroom/shares/${s.id}`, { method: "DELETE" }));
  };

  const active = (shares ?? []).filter((s) => s.status === "active");
  const sections: { key: string; title: string; tone: string; items: Share[] }[] = [
    { key: "later", title: "Expire dans plus de 7 jours", tone: "bg-emerald-50 text-emerald-900", items: active.filter((s) => daysLeft(s.expiresAt) > 7) },
    { key: "soon", title: "Expire dans 7 jours ou moins", tone: "bg-amber-50 text-amber-900", items: active.filter((s) => daysLeft(s.expiresAt) <= 7) },
    { key: "ended", title: "Expirés ou retirés", tone: "bg-red-50 text-red-900", items: (shares ?? []).filter((s) => s.status !== "active") },
  ];

  const teamWithAccess = team.filter(
    (m) => m.member && !m.isBot && (folder.visibility === "public" || m.isAdmin || folder.sharedWith.map((e) => e.toLowerCase()).includes(m.email.toLowerCase())),
  );

  return (
    <aside className="border-border bg-card h-fit rounded-2xl border p-4 shadow-(--shadow-card)" aria-label="Utilisateurs ayant accès">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground text-base font-bold">Utilisateurs ayant accès</h2>
          <p className="text-muted-foreground text-xs">
            {active.length} invité{active.length > 1 ? "s" : ""} actif{active.length > 1 ? "s" : ""} · {teamWithAccess.length} membre
            {teamWithAccess.length > 1 ? "s" : ""} de l&apos;équipe
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Ajouter
        </button>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setHideEmpty((v) => !v)}
          className="border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1 text-[11px] font-medium"
        >
          {hideEmpty ? "Afficher les sections vides" : "Masquer les sections vides"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
      {!shares && !error && <p className="text-muted-foreground mt-3 text-xs">Chargement…</p>}

      <div className="mt-3 space-y-3">
        {shares &&
          sections
            .filter((sec) => !hideEmpty || sec.items.length)
            .map((sec) => (
              <section key={sec.key} className="border-border overflow-hidden rounded-xl border">
                <div className={`flex items-center justify-between px-3 py-2 text-xs font-semibold ${sec.tone}`}>
                  <span>{sec.title}</span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 tabular-nums">{sec.items.length}</span>
                </div>
                <div className="space-y-2 p-2">
                  {!sec.items.length && <p className="text-muted-foreground px-1 py-1 text-xs">Aucun utilisateur</p>}
                  {sec.items.map((s) => {
                    const left = daysLeft(s.expiresAt);
                    return (
                      <div key={s.id} className="border-border rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-foreground truncate text-sm font-semibold">{nameOf(s.email)}</p>
                            <p className="text-muted-foreground truncate text-xs">{s.email}</p>
                          </div>
                          {s.status === "active" && (
                            <button
                              type="button"
                              onClick={() => revoke(s)}
                              disabled={!!busy}
                              className="text-muted-foreground shrink-0 rounded-md p-1 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                              aria-label={`Retirer l'accès de ${s.email}`}
                              title="Retirer l'accès"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <span
                          className={
                            "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                            (s.status === "revoked"
                              ? "bg-gray-100 text-gray-600"
                              : s.status === "expired"
                                ? "bg-red-50 text-red-700"
                                : left <= 7
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-emerald-50 text-emerald-800")
                          }
                        >
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {s.status === "revoked"
                            ? "Accès retiré"
                            : s.status === "expired"
                              ? `Expiré le ${fmt(s.expiresAt)}`
                              : left <= 1
                                ? "Expire aujourd'hui ou demain"
                                : `${left} j restants`}
                        </span>
                        <select
                          value=""
                          disabled={!!busy}
                          onChange={(e) => e.target.value && void setDuration(s, Number(e.target.value))}
                          className="border-border bg-card text-foreground mt-2 w-full rounded-lg border px-2 py-1.5 text-xs"
                          aria-label={`Durée d'accès de ${s.email}`}
                        >
                          <option value="">{s.status === "active" ? "Modifier la durée d'accès" : "Rétablir l'accès…"}</option>
                          {DURATIONS.map((d) => (
                            <option key={d} value={d}>
                              {d} jour{d > 1 ? "s" : ""} à partir d&apos;aujourd&apos;hui
                            </option>
                          ))}
                        </select>
                        <p className="text-muted-foreground mt-2 text-[11px]">
                          Partagé par {s.createdBy || "?"} le {fmt(s.createdAt)} ·{" "}
                          {s.opens ? `ouvert ${s.opens} fois, dernière fois le ${fmt(s.lastOpenedAt ?? s.createdAt)}` : "jamais ouvert"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

        <section className="border-border overflow-hidden rounded-xl border">
          <div className="bg-muted text-foreground flex items-center justify-between px-3 py-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5">
              {folder.visibility === "public" ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
              Équipe ({folder.visibility === "public" ? "Data Room publique : tous les membres" : "Data Room privée : admins"})
            </span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 tabular-nums">{teamWithAccess.length}</span>
          </div>
          <ul className="divide-border divide-y">
            {teamWithAccess.map((m) => (
              <li key={m.email} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-foreground truncate text-xs font-semibold">{m.name}</p>
                  <p className="text-muted-foreground truncate text-[11px]">{m.email}</p>
                </div>
                {m.isAdmin && <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold">ADMIN</span>}
              </li>
            ))}
            {!teamWithAccess.length && <li className="text-muted-foreground px-3 py-2 text-xs">Liste de l&apos;équipe indisponible.</li>}
          </ul>
        </section>
      </div>
    </aside>
  );
}
