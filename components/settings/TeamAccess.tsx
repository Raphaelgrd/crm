"use client";

import { useState } from "react";
import { Bot, ShieldCheck } from "lucide-react";
import { initials, useCrmUser, useTeamMembers, type TeamMember } from "@/lib/rapport";

function RoleBadge({ m }: { m: TeamMember }) {
  if (m.isBot) {
    return (
      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 uppercase dark:bg-violet-950/40 dark:text-violet-300">
        {m.isAdmin ? "IA · accès complet" : "IA · accès limité"}
      </span>
    );
  }
  if (m.isOwner) {
    return (
      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
        Propriétaire
      </span>
    );
  }
  if (m.isAdmin) {
    return (
      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">Admin</span>
    );
  }
  return (
    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
      Membre
    </span>
  );
}

export function TeamAccess() {
  const { user, isAdmin, loading: meLoading } = useCrmUser();
  const { members, loading, error, setAdmin } = useTeamMembers();
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (m: TeamMember) => {
    setBusy(m.uid);
    try {
      await setAdmin(m.uid, !m.isAdmin);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
      <h2 className="text-foreground mb-1 flex items-center gap-2 text-base font-bold">
        <ShieldCheck className="h-4 w-4 text-gray-400" aria-hidden="true" />
        Équipe et accès
      </h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Les admins voient la Data Room et la page Équipe, et gèrent les accès. Pour ajouter quelqu&apos;un, il crée
        son compte depuis la page de connexion, puis apparaît ici.
      </p>

      {meLoading || loading ? (
        <p className="text-muted-foreground py-4 text-center text-sm">Chargement…</p>
      ) : !isAdmin ? (
        <p className="text-muted-foreground text-sm">Seuls les admins peuvent gérer les accès.</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <ul className="divide-border divide-y">
          {members.map((m) => {
            const isSelf = m.uid === user?.uid;
            return (
              <li key={m.uid} className="flex items-center gap-3 py-2.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.isBot ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "bg-primary text-white"}`}
                >
                  {m.isBot ? <Bot className="h-4 w-4" aria-hidden="true" /> : initials(m.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-foreground truncate text-sm font-semibold">
                      {m.name}
                      {isSelf && <span className="text-muted-foreground font-normal"> (toi)</span>}
                    </p>
                    <RoleBadge m={m} />
                  </div>
                  <p className="text-muted-foreground truncate text-xs">
                    {m.isBot
                      ? "Compte de l'API (Claude, ChatGPT…) : l'accès complet lui ouvre l'activité de l'équipe et le rapport d'heures."
                      : m.email || "—"}
                  </p>
                </div>
                {m.isOwner ? (
                  <span className="text-muted-foreground shrink-0 text-xs">Toujours admin</span>
                ) : isSelf ? (
                  <span className="text-muted-foreground shrink-0 text-xs">—</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy === m.uid}
                    onClick={() => void toggle(m)}
                    className={
                      "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 " +
                      (m.isAdmin
                        ? "border-border bg-card text-foreground hover:bg-muted border"
                        : "bg-primary text-primary-foreground hover:opacity-90")
                    }
                  >
                    {busy === m.uid
                      ? "…"
                      : m.isBot
                        ? m.isAdmin
                          ? "Retirer l'accès"
                          : "Donner l'accès"
                        : m.isAdmin
                          ? "Retirer admin"
                          : "Rendre admin"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
