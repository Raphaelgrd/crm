"use client";

import { useState, type ReactNode } from "react";
import { Lock, ArrowLeft } from "lucide-react";
import { frAuthError, signInRapport, signUpRapport, useCrmUser } from "@/lib/rapport";
import { sendPasswordResetEmail } from "firebase/auth";
import { getRapportAuth } from "@/lib/rapport";

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

/**
 * Porte d'entrée du CRM : connexion unique avec les comptes de l'équipe
 * (projet Firebase du Rapport d'activité). La session persiste dans le
 * navigateur — on ne se reconnecte que sur un nouvel appareil.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useCrmUser();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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
    setSuccess("");
    if (mode === "reset") {
      if (!email) {
        setError("Remplissez votre email.");
        return;
      }
      setBusy(true);
      try {
        await sendPasswordResetEmail(getRapportAuth(), email.trim());
        setSuccess(
          "Email de réinitialisation envoyé ! Vérifie ta boîte de réception (et les spams).",
        );
        setEmail("");
        setTimeout(() => setMode("login"), 3000);
      } catch (err) {
        setError(
          (err as { code?: string }).code === "auth/user-not-found"
            ? "Aucun compte avec cet email."
            : "Erreur. Réessayez.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
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
        {mode !== "reset" && (
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
        )}
        {mode === "reset" && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setSuccess("");
                setEmail("");
              }}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-xs font-medium transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Retour
            </button>
            <h1 className="text-foreground mt-3 text-lg font-bold">Réinitialiser le mot de passe</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Entre ton email pour recevoir un lien de réinitialisation
            </p>
          </div>
        )}
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
          {mode !== "reset" && (
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
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            {busy
              ? "…"
              : mode === "login"
                ? "Se connecter"
                : mode === "signup"
                  ? "S'inscrire"
                  : "Envoyer le lien"}
          </button>
        </form>
        {mode !== "reset" && (
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === "login" ? "signup" : "login"));
                setError("");
                setSuccess("");
              }}
              className="text-muted-foreground hover:text-foreground block w-full text-center text-xs font-medium transition-colors"
            >
              {mode === "login"
                ? "Pas encore de compte ? Créer un compte"
                : "Déjà un compte ? Se connecter"}
            </button>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError("");
                  setSuccess("");
                  setPassword("");
                }}
                className="text-muted-foreground hover:text-foreground block w-full text-center text-xs font-medium transition-colors"
              >
                Mot de passe oublié ?
              </button>
            )}
          </div>
        )}
        <p className="text-muted-foreground mt-4 text-center text-[10px] leading-relaxed">
          Mêmes identifiants que le Rapport d&apos;activité — une seule connexion pour tout le CRM.
        </p>
      </div>
    </div>
  );
}
