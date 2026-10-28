"use client";

import { useState } from "react";
import { Bot, ShieldCheck, UserPlus, X } from "lucide-react";
import {
  createTeamAccount,
  frAuthError,
  initials,
  useCrmUser,
  useTeamMembers,
  type TeamMember,
} from "@/lib/rapport";

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

function AddMemberForm({ onDone, onCancel }: { onDone: (msg: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError("Prénom, email et mot de passe (6 caractères min.) obligatoires.");
      return;
    }
    setBusy(true);
    try {
      await createTeamAccount(name.trim(), email.trim().toLowerCase(), password, admin);
      onDone(`Compte créé pour ${name.trim()}. Donne-lui son email et ce mot de passe pour qu'il se connecte.`);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(
        code === "auth/email-already-in-use"
          ? "Ce compte existe déjà : il apparaîtra ici dès que la personne se connectera au CRM."
          : code
            ? frAuthError(code)
            : (err as Error).message || "Création impossible.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-muted/40 mb-4 space-y-3 rounded-xl border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input className={inputClass} placeholder="Prénom" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className={inputClass}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={inputClass}
          type="text"
          placeholder="Mot de passe provisoire"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
        Admin
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Création…" : "Créer le compte"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:bg-muted rounded-lg px-3 py-2 text-sm font-semibold"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function RoleBadge({ m }: { m: TeamMember }) {
  if (m.isBot) {
    return (
      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 uppercase dark:bg-violet-950/40 dark:text-violet-300">
        {m.isAdmin ? "IA · accès complet" : "IA · accès limité"}
      </span>
    );
  }
  if (m.member === false) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase dark:bg-amber-950/40 dark:text-amber-300">
        Sans accès
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
  const { members, loading, error, complete, setAdmin, setMember, reload } = useTeamMembers();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");

  const run = async (m: TeamMember, action: () => Promise<void>) => {
    setBusy(m.uid);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };
  const toggle = (m: TeamMember) =>
    run(m, () => (m.member === false ? setMember(m.uid, true) : setAdmin(m.uid, !m.isAdmin)));

  return (
    <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-foreground flex items-center gap-2 text-base font-bold">
          <ShieldCheck className="h-4 w-4 text-gray-400" aria-hidden="true" />
          Équipe et accès
        </h2>
        {isAdmin && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setNotice("");
            }}
            className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Ajouter un membre
          </button>
        )}
      </div>
      <p className="text-muted-foreground mb-4 text-xs">
        Les admins voient la Data Room et la page Équipe, et gèrent les accès. Un compte créé ailleurs (console
        Firebase) apparaît ici dès que la personne se connecte au CRM.
      </p>
      {notice && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Fermer">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </p>
      )}
      {adding && (
        <AddMemberForm
          onCancel={() => setAdding(false)}
          onDone={(msg) => {
            setAdding(false);
            setNotice(msg);
            void reload();
          }}
        />
      )}

      {isAdmin && !loading && !complete && (
        <p className="text-muted-foreground mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Liste partielle : seuls les comptes déjà connectés au CRM apparaissent. Ajoute le compte de service Firebase
          (FIREBASE_SERVICE_ACCOUNT_RAPPORT) dans Vercel pour voir tout le monde.
        </p>
      )}
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
                      (m.isAdmin && m.member !== false
                        ? "border-border bg-card text-foreground hover:bg-muted border"
                        : "bg-primary text-primary-foreground hover:opacity-90")
                    }
                  >
                    {busy === m.uid
                      ? "…"
                      : m.member === false
                        ? "Autoriser l'accès"
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
