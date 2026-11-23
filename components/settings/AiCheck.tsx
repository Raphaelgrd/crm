"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";

// Paramètres → vérifie chaque IA du CRM (Claude en premier, puis les relais gratuits) avec une courte question.

interface Result {
  id: string;
  name: string;
  model: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export function AiCheck() {
  const { isAdmin } = useCrmUser();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ results: Result[]; claudeKey: boolean } | null>(null);
  const [error, setError] = useState("");
  if (!isAdmin) return null;

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/ai-check", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { results?: Result[]; claudeKey?: boolean; error?: string };
      if (!res.ok || !j.results) throw new Error(j.error ?? `Erreur ${res.status}`);
      setData({ results: j.results, claudeKey: !!j.claudeKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-base font-bold">
            <Sparkles className="h-4 w-4 text-gray-400" aria-hidden="true" />
            IA du CRM
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Claude répond en premier (clé ANTHROPIC_API_KEY sur Vercel) ; Groq, Gemini et Mistral prennent le relais s&apos;il échoue.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Test en cours…" : "Tester les IA"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
      {data && (
        <div className="mt-3 space-y-2">
          {!data.claudeKey && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Claude n&apos;est pas branché : ajoute la variable <strong>ANTHROPIC_API_KEY</strong> sur Vercel, puis redéploie.
            </p>
          )}
          <ul className="divide-border border-border divide-y rounded-xl border">
            {data.results.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-foreground font-semibold">
                    {i + 1}. {r.name} <span className="text-muted-foreground font-normal">· {r.model}</span>
                  </p>
                  {!r.ok && <p className="mt-0.5 text-xs break-words text-red-700">{r.detail}</p>}
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " + (r.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
                  }
                >
                  {r.ok ? `Répond (${(r.ms / 1000).toFixed(1)} s)` : "Échec"}
                </span>
              </li>
            ))}
            {!data.results.length && <li className="px-3 py-2 text-sm text-red-700">Aucune IA configurée.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
