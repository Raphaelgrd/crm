"use client";

import { useState } from "react";
import { AlertCircle, Eye, Loader2, PenLine } from "lucide-react";
import { authFetch, useCrmUser } from "@/lib/rapport";

export interface ContractPerson {
  firstName: string;
  lastName: string;
  email: string;
}

/** Champs du contrat (partie réceptrice) + email du signataire. */
export interface ContractFormData {
  lastName: string;
  firstName: string;
  email: string;
  company: string;
  address: string;
  registration: string;
  jobTitle: string;
  representedBy: string;
  shortName: string;
}

export const DEFAULT_NETFORCE: ContractPerson = { firstName: "Laurent", lastName: "Mollinari", email: "" };

export const representedBy = (f: Pick<ContractFormData, "firstName" | "lastName" | "jobTitle">) =>
  [[f.firstName, f.lastName].filter(Boolean).join(" "), f.jobTitle].filter(Boolean).join(", ");

const input =
  "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

function Field({ label, value, onChange, wide, type, disabled }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string; disabled?: boolean }) {
  return (
    <label className={`block space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <input className={input} type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Formulaire d'un contrat pré-rempli, avec aperçu PDF et envoi pour signature via Yousign. */
export function ContractForm({
  contractId,
  contactId,
  initial,
  initialNetforce,
  onSent,
}: {
  contractId: string;
  contactId: string;
  initial: ContractFormData;
  initialNetforce: ContractPerson | null;
  onSent: (message: string) => void;
}) {
  const { name } = useCrmUser();
  const [form, setForm] = useState(initial);
  const [repEdited, setRepEdited] = useState(initial.representedBy !== representedBy(initial));
  const [netforce, setNetforce] = useState<ContractPerson>(initialNetforce ?? DEFAULT_NETFORCE);
  const [busy, setBusy] = useState<"" | "send" | "preview">("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const locked = !!busy || done;

  function update(patch: Partial<ContractFormData>) {
    setConfirm(false);
    setForm((f) => {
      const next = { ...f, ...patch };
      // « Représentée par » suit le nom et la fonction tant qu'on ne l'a pas modifié à la main.
      if (!repEdited && !("representedBy" in patch)) next.representedBy = representedBy(next);
      return next;
    });
  }

  const payload = () => ({ contractId, data: form, partnerEmail: form.email, netforceSigner: netforce, contactId, sentBy: name });

  async function preview() {
    setBusy("preview");
    setError("");
    // Fenêtre ouverte tout de suite : sinon le navigateur la bloque après l'attente.
    const win = window.open("", "_blank");
    try {
      const r = await authFetch(`/api/contracts/${contractId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Aperçu impossible.");
      const url = URL.createObjectURL(await r.blob());
      if (win) win.location.href = url;
      else window.open(url, "_blank");
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : "Aperçu impossible.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("Prénom, nom et email du signataire sont obligatoires.");
      return;
    }
    if (!netforce.email.trim()) {
      setError("Renseigne l'email du signataire Netforce.");
      return;
    }
    if (!confirm) {
      setConfirm(true);
      setError("");
      return;
    }
    setBusy("send");
    setError("");
    try {
      const r = await authFetch("/api/yousign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok || d.error) throw new Error(d.error || "Envoi impossible.");
      setDone(true);
      onSent(`${contractId} envoyé à ${form.firstName} ${form.lastName} et ${netforce.firstName} ${netforce.lastName}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
      setConfirm(false);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" value={form.lastName} disabled={locked} onChange={(v) => update({ lastName: v })} />
        <Field label="Prénom" value={form.firstName} disabled={locked} onChange={(v) => update({ firstName: v })} />
        <Field label="Email (reçoit le lien de signature)" type="email" value={form.email} disabled={locked} onChange={(v) => update({ email: v })} wide />
        <Field label="Société" value={form.company} disabled={locked} onChange={(v) => update({ company: v })} />
        <Field label="Fonction" value={form.jobTitle} disabled={locked} onChange={(v) => update({ jobTitle: v })} />
        <Field label="Siège social" value={form.address} disabled={locked} onChange={(v) => update({ address: v })} wide />
        <Field label="Numéro d'immatriculation (RCS, SIREN…)" value={form.registration} disabled={locked} onChange={(v) => update({ registration: v })} />
        <Field label="Ci-après dénommée « … »" value={form.shortName} disabled={locked} onChange={(v) => update({ shortName: v })} />
        <Field
          label="Représentée par"
          value={form.representedBy}
          disabled={locked}
          onChange={(v) => {
            setRepEdited(true);
            update({ representedBy: v });
          }}
          wide
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signataire Netforce</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={input} placeholder="Prénom" disabled={locked} value={netforce.firstName} onChange={(e) => setNetforce({ ...netforce, firstName: e.target.value })} />
          <input className={input} placeholder="Nom" disabled={locked} value={netforce.lastName} onChange={(e) => setNetforce({ ...netforce, lastName: e.target.value })} />
          <input className={input} type="email" placeholder="Email" disabled={locked} value={netforce.email} onChange={(e) => setNetforce({ ...netforce, email: e.target.value })} />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!done && (
        <div className="flex gap-2">
          <button
            onClick={() => void preview()}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
          >
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Aperçu
          </button>
          <button
            onClick={() => void send()}
            disabled={!!busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {busy === "send" ? "Envoi…" : confirm ? `Confirmer l'envoi à ${form.email}` : "Envoyer pour signature"}
          </button>
        </div>
      )}
    </div>
  );
}
