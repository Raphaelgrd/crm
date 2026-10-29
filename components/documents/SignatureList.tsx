"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Loader2, RefreshCw, XCircle } from "lucide-react";
import { authFetch } from "@/lib/rapport";
import { SIGNATURE_STATUS, SIGNER_STATUS, useSignatures, type SignatureRequest } from "@/lib/signatures";

const TONE: Record<string, string> = {
  wait: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ok: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ko: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  neutral: "bg-muted text-muted-foreground",
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function Row({ s }: { s: SignatureRequest }) {
  const [busy, setBusy] = useState<"" | "refresh" | "cancel" | "download">("");
  const [error, setError] = useState("");
  const status = SIGNATURE_STATUS[s.status] ?? { label: s.status, tone: "neutral" };

  async function run(kind: "refresh" | "cancel" | "download") {
    if (kind === "cancel" && !confirm(`Annuler la demande de signature « ${s.title} » ? Les signataires ne pourront plus signer.`)) return;
    setBusy(kind);
    setError("");
    try {
      const res = await authFetch(`/api/yousign/${s.id}${kind === "download" ? "/download" : ""}`, {
        method: kind === "refresh" ? "POST" : kind === "cancel" ? "DELETE" : "GET",
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Erreur Yousign.");
      if (kind === "download") {
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = `${s.title.replace(/[^\w\- ]+/g, "_")}${s.status === "done" ? "_signé" : ""}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur Yousign.");
    } finally {
      setBusy("");
    }
  }

  const btn = "rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{s.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[status.tone]}`}>{status.label}</span>
            {s.env === "sandbox" && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">test</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Envoyé le {fmt(s.createdAt)} par {s.sentBy}
            {s.signedAt ? ` · signé le ${fmt(s.signedAt)}` : ""}
            {s.contactName && (
              <>
                {" · "}
                <Link href={`/contacts?q=${encodeURIComponent(s.contactName)}`} className="underline-offset-2 hover:underline">
                  {s.contactName}
                </Link>
              </>
            )}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {s.signers.map((x) => (
              <li key={x.email} className="text-xs">
                <span className="font-medium">{x.name}</span>{" "}
                <span className={x.status === "signed" ? "text-green-600" : x.status === "declined" ? "text-red-600" : "text-muted-foreground"}>
                  · {SIGNER_STATUS[x.status] ?? x.status}
                </span>
              </li>
            ))}
          </ul>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button className={btn} title="Actualiser le statut" disabled={!!busy} onClick={() => void run("refresh")}>
            {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button className={btn} title={s.status === "done" ? "Télécharger le PDF signé" : "Télécharger le PDF"} disabled={!!busy} onClick={() => void run("download")}>
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
          {(s.status === "ongoing" || s.status === "approval") && (
            <button className={btn} title="Annuler la demande" disabled={!!busy} onClick={() => void run("cancel")}>
              {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function SignatureList() {
  const { signatures, loading } = useSignatures();
  if (loading || !signatures.length) return null;
  return (
    <section className="mb-10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signatures Yousign</p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {signatures.map((s) => (
          <Row key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}
