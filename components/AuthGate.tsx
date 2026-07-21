"use client";

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { frAuthError, signInRapport, signUpRapport, useCrmUser } from "@/lib/rapport";

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

/**
 * Porte d'entrée du CRM : connexion unique avec les comptes de l'équipe
 * (projet Firebase du Rapport d'activité). La session persiste dans le
 * navigateur — on ne se reconnecte que sur un nouvel appareil.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useCrmUser();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Connexion en cours…</p>
      </div>
    );
  }

  if (user) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password || (mode === "signup" && !name.trim())) {
      setError("Remplissez tous les champs.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") await signUpRapport(name.trim(), email.trim(), password);
      else await signInRapport(email.trim(), password);
    } catch (err) {
      setError(frAuthError((err as { code?: string }).code ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-muted flex h-screen w-full items-center justify-center p-4">
      <div className="border-border bg-card w-full max-w-sm rounded-2xl border p-8 shadow-(--shadow-card)">
        <div className="mb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/netforce.jpg" alt="Netforce" className="h-10 w-10 rounded-xl object-contain" />
          <div>
            <h1 className="text-foreground text-lg font-bold">Netforce CRM</h1>
            <p className="text-muted-foreground text-xs">
              {mode === "login" ? "Connexion à ton espace" : "Créer un compte équipe"}
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="text-foreground mb-1 block text-xs font-medium">Prénom</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex : Raphael"
                autoComplete="given-name"
              />
            </div>
          )}
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">Email</label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@netforce.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">Mot de passe</label>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            {busy ? "…" : mode === "login" ? "Se connecter" : "S'inscrire"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "signup" : "login"));
            setError("");
          }}
          className="text-muted-foreground hover:text-foreground mt-3 w-full text-center text-xs font-medium transition-colors"
        >
          {mode === "login"
            ? "Pas encore de compte ? Créer un compte"
            : "Déjà un compte ? Se connecter"}
        </button>
        <p className="text-muted-foreground mt-4 text-center text-[10px] leading-relaxed">
          Mêmes identifiants que le Rapport d&apos;activité — une seule connexion pour tout le CRM.
        </p>
      </div>
    </div>
  );
}
