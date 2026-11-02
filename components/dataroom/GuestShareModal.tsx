"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Send, UserX, X } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";

interface Share {
  id: string;
  email: string;
  expiresAt: string;
  activatedAt: string | null;
  lastOpenedAt: string | null;
}

const DURATIONS = [
  { days: 1, label: "24 heures" },
  { days: 3, label: "3 jours" },
  { days: 7, label: "7 jours" },
  { days: 14, label: "14 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "3 mois" },
];

const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Partage temporaire d'une Data Room avec une personne extérieure (compte invité, lien par email). */
export function GuestShareModal({ folderId, folderName, onClose }: { folderId: string; folderName: string; onClose: () => void }) {
  const { name } = useCrmUser();
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [message, setMessage] = useState("");
  const [shares, setShares] = useState<Share[] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ email: string; url: string; emailed: boolean; emailError: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const r = await authFetch(`/api/dataroom/folders/${folderId}/shares`);
      const d = (await r.json()) as { shares?: Share[]; error?: string };
      if (!r.ok) throw new Error(d.error || "Chargement impossible.");
      setShares(d.shares ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
      setShares([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    setResult(null);
    try {
      const r = await authFetch(`/api/dataroom/folders/${folderId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, days, message, senderName: name }),
      });
      const d = (await r.json()) as { url?: string; emailed?: boolean; emailError?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error || "Partage impossible.");
      setResult({ email: email.trim().toLowerCase(), url: d.url, emailed: !!d.emailed, emailError: d.emailError ?? "" });
      setEmail("");
      setMessage("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Partage impossible.");
    } finally {
      setSending(false);
    }
  }

  async function revoke(s: Share) {
    if (!confirm(`Retirer l'accès de ${s.email} à « ${folderName} » ?`)) return;
    try {
      const r = await authFetch(`/api/dataroom/shares/${s.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Retrait impossible.");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Retrait impossible.");
    }
  }

  const input = "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-foreground text-lg font-bold">Partager « {folderName} »</h2>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1" aria-label="Fermer">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>
        <p className="text-muted-foreground mb-5 text-sm">
          La personne reçoit un lien par email. À son premier clic, un compte invité est créé avec son adresse : elle voit et télécharge
          uniquement cette Data Room, jusqu&apos;à la date choisie.
        </p>

        <form onSubmit={(e) => void send(e)} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">Email de la personne</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@societe.com" className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">Accès pendant</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
              {DURATIONS.map((d) => (
                <option key={d.days} value={d.days}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">Message (facultatif)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={`${input} resize-y`} />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Envoyer l&apos;invitation
          </button>
        </form>

        {result && (
          <div
            className={`mt-4 rounded-lg px-3 py-2.5 text-sm ${result.emailed ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"}`}
          >
            <p>
              {result.emailed
                ? `Invitation envoyée à ${result.email}.`
                : `Accès créé pour ${result.email}, mais l'email n'est pas parti (${result.emailError}). Envoie-lui ce lien toi-même :`}
            </p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(result.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline-offset-2 hover:underline"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? "Lien copié" : "Copier le lien"}
            </button>
          </div>
        )}

        <div className="mt-6">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Invités en cours</p>
          {shares === null ? (
            <Loader2 className="text-primary h-4 w-4 animate-spin" aria-hidden="true" />
          ) : shares.length === 0 ? (
            <p className="text-muted-foreground text-sm">Personne pour l&apos;instant.</p>
          ) : (
            <ul className="divide-border divide-y">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">{s.email}</p>
                    <p className="text-muted-foreground text-xs">
                      {s.activatedAt ? `Compte activé le ${fmt(s.activatedAt)}` : "Lien pas encore ouvert"} · expire le {fmt(s.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revoke(s)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
