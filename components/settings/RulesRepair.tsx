"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";

// Paramètres → publier les règles de sécurité Firestore du CRM (si l'écran ne se met plus à jour : « permission-denied »).

export function RulesRepair() {
  const { isAdmin } = useCrmUser();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!isAdmin) return null;

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await authFetch("/api/admin/firestore-rules", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; already?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Erreur ${res.status}`);
      setMsg({
        ok: true,
        text: j.already
          ? "Les bonnes règles étaient déjà publiées."
          : "Règles publiées. Attends une minute puis recharge le CRM (Cmd+Maj+R).",
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-base font-bold">
            <ShieldCheck className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Règles de sécurité de la base
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            À utiliser si l&apos;écran affiche « Synchronisation interrompue (permission-denied) » : publie les règles du CRM
            sur Firebase, sans passer par la console.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Publication…" : "Publier les règles"}
        </button>
      </div>
      {msg && <p className={"mt-3 text-sm font-medium " + (msg.ok ? "text-emerald-700" : "text-red-700")}>{msg.text}</p>}
    </div>
  );
}
