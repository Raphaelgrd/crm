"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, PenLine, Search } from "lucide-react";
import { useContacts, type Contact } from "@/lib/contacts";
import { authFetch, useCrmUser } from "@/lib/rapport";

interface Template {
  id: string;
  name: string;
  labels: string[];
}

interface Recipient {
  contact: Contact | null;
  firstName: string;
  lastName: string;
  email: string;
}

const EMPTY: Recipient = { contact: null, firstName: "", lastName: "", email: "" };
const input =
  "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function RecipientPicker({ label, value, onChange }: { label: string; value: Recipient; onChange: (r: Recipient) => void }) {
  const { contacts } = useContacts();
  const [q, setQ] = useState("");
  const results = q.trim()
    ? contacts
        .filter((c) => `${c.firstName} ${c.lastName} ${c.company} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 6)
    : [];

  if (value.contact) {
    const c = value.contact;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate text-sm font-medium">
              {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
              {c.company ? <span className="text-muted-foreground"> · {c.company}</span> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{value.email || "pas d'email sur la fiche"}</p>
          </div>
          <button onClick={() => onChange(EMPTY)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
            Changer
          </button>
        </div>
        {/* Une fiche incomplète se complète ici, sans quitter la page. */}
        {(!c.firstName || !c.lastName || !c.email) && (
          <div className="grid grid-cols-3 gap-2">
            <input className={input} placeholder="Prénom" value={value.firstName} onChange={(e) => onChange({ ...value, firstName: e.target.value })} />
            <input className={input} placeholder="Nom" value={value.lastName} onChange={(e) => onChange({ ...value, lastName: e.target.value })} />
            <input className={input} type="email" placeholder="Email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        placeholder="Rechercher un contact…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-xl border border-border bg-input py-2.5 pr-3 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange({ contact: c, firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "" });
                setQ("");
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {c.firstName} {c.lastName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{[c.company, c.email].filter(Boolean).join(" · ")}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function YousignSend() {
  const { name } = useCrmUser();
  const [state, setState] = useState<{ configured: boolean; env: string; templates: Template[]; error?: string } | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [recipients, setRecipients] = useState<Record<string, Recipient>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  useEffect(() => {
    authFetch("/api/yousign")
      .then(async (r) => ({ ok: r.ok, d: (await r.json()) as { configured?: boolean; env?: string; templates?: Template[]; error?: string } }))
      .then(({ ok, d }) =>
        setState({ configured: !!d.configured || !ok, env: d.env ?? "production", templates: d.templates ?? [], error: ok ? undefined : d.error }),
      )
      .catch(() => setState({ configured: true, env: "production", templates: [], error: "Yousign injoignable, recharge la page." }));
  }, []);

  const template = state?.templates.find((t) => t.id === templateId);
  // Modèle sans signataire à compléter détecté : on suppose un seul destinataire, libellé par défaut.
  const labels = template ? (template.labels.length ? template.labels : ["Signataire"]) : [];
  const ready = !!template && labels.every((l) => recipients[l]?.contact);

  async function send() {
    if (!template) return;
    setError("");
    const signers = labels.map((label) => ({ label, ...recipients[label] }));
    const missing = signers.find((s) => !s.firstName.trim() || !s.lastName.trim() || !s.email.trim());
    if (missing) {
      setError(`Prénom, nom et email obligatoires pour ${missing.label}.`);
      return;
    }
    const main = signers[0].contact!;
    setSending(true);
    try {
      const res = await authFetch("/api/yousign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          templateName: template.name,
          contactId: main.id,
          contactName: [main.firstName, main.lastName].filter(Boolean).join(" "),
          company: main.company ?? "",
          sentBy: name,
          signers: signers.map(({ label, firstName, lastName, email }) => ({ label, firstName, lastName, email })),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Envoi impossible.");
      setSent(`${template.name} envoyé à ${signers.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}.`);
      setRecipients({});
      setTemplateId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mb-10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Envoyer pour signature · Yousign</p>

      {!state ? (
        <div className="flex justify-center rounded-xl border border-border bg-card py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : !state.configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-semibold">Yousign n'est pas encore connecté.</p>
          <p className="mt-1">
            Ajoute la clé d'API Yousign dans Vercel sous le nom <code className="font-mono">YOUSIGN_API_KEY</code>, puis redéploie.
          </p>
        </div>
      ) : state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </div>
      ) : !state.templates.length ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Aucun modèle trouvé dans Yousign. Crée tes modèles NDA et MOU dans Yousign → Modèles, puis recharge la page.
        </p>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          {state.env === "sandbox" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Mode test Yousign : les signatures n'ont pas de valeur légale.</p>
          )}
          {sent && (
            <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
              <Check className="h-4 w-4 shrink-0" />
              {sent} Yousign envoie l'email de signature.
            </p>
          )}

          <div>
            <p className="mb-2 text-xs text-muted-foreground">Document</p>
            <div className="flex flex-wrap gap-2">
              {state.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTemplateId(t.id);
                    setSent("");
                    setError("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    t.id === templateId ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {template &&
            labels.map((label) => (
              <RecipientPicker
                key={label}
                label={labels.length > 1 ? `Envoyer à – ${label}` : "Envoyer à"}
                value={recipients[label] ?? EMPTY}
                onChange={(r) => setRecipients((prev) => ({ ...prev, [label]: r }))}
              />
            ))}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={() => void send()}
            disabled={!ready || sending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {sending ? "Envoi…" : "Envoyer pour signature"}
          </button>
        </div>
      )}
    </section>
  );
}
