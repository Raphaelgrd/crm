"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Eye, Loader2, PenLine, Search, Upload } from "lucide-react";
import { useContacts, type Contact } from "@/lib/contacts";
import { authFetch, useCrmUser } from "@/lib/rapport";

interface ContractInfo {
  id: string;
  name: string;
  uploaded: boolean;
  uploadedAt: string | null;
  netforceSigner: Person | null;
}

interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

interface Form {
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

const EMPTY_FORM: Form = { lastName: "", firstName: "", email: "", company: "", address: "", registration: "", jobTitle: "", representedBy: "", shortName: "" };
const DEFAULT_NETFORCE: Person = { firstName: "Laurent", lastName: "Mollinari", email: "" };

const input =
  "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** Première colonne « extra » renseignée parmi plusieurs noms possibles (imports CSV, scan de cartes). */
function extra(c: Contact, keys: string[]) {
  const e = c.extra ?? {};
  const k = Object.keys(e).find((x) => keys.some((y) => x.toLowerCase() === y.toLowerCase()) && e[x]?.trim());
  return k ? e[k].trim() : "";
}

const represented = (f: Pick<Form, "firstName" | "lastName" | "jobTitle">) =>
  [[f.firstName, f.lastName].filter(Boolean).join(" "), f.jobTitle].filter(Boolean).join(", ");

function formFromContact(c: Contact): Form {
  const f = {
    lastName: c.lastName ?? "",
    firstName: c.firstName ?? "",
    email: c.email ?? "",
    company: c.company ?? "",
    address: [extra(c, ["Adresse", "Address", "Siège social"]), c.country].filter(Boolean).join(", "),
    registration: extra(c, ["SIRET", "SIREN", "RCS", "Immatriculation", "Numéro d'immatriculation"]),
    jobTitle: extra(c, ["Poste", "Fonction", "Titre", "Job Title"]),
    representedBy: "",
    shortName: c.company ?? "",
  };
  return { ...f, representedBy: represented(f) };
}

function Field({ label, value, onChange, wide, type }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string }) {
  return (
    <label className={`block space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <input className={input} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ContactSearch({ onPick }: { onPick: (c: Contact) => void }) {
  const { contacts } = useContacts();
  const [q, setQ] = useState("");
  const results = q.trim()
    ? contacts.filter((c) => `${c.firstName} ${c.lastName} ${c.company} ${c.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                onPick(c);
                setQ("");
              }}
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-accent"
            >
              <p className="truncate font-medium">
                {c.firstName} {c.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{[c.company, c.email].filter(Boolean).join(" · ")}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function YousignSend() {
  const { name, isAdmin } = useCrmUser();
  const [state, setState] = useState<{ configured: boolean; env: string; contracts: ContractInfo[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [contractId, setContractId] = useState("");
  const [contact, setContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [repEdited, setRepEdited] = useState(false);
  const [netforce, setNetforce] = useState<Person>(DEFAULT_NETFORCE);
  const [busy, setBusy] = useState<"" | "send" | "preview" | "upload">("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const r = await authFetch("/api/yousign");
      const d = (await r.json()) as { configured?: boolean; env?: string; contracts?: ContractInfo[]; error?: string };
      if (!r.ok) throw new Error(d.error || "Chargement impossible.");
      setState({ configured: !!d.configured, env: d.env ?? "production", contracts: d.contracts ?? [] });
      const saved = d.contracts?.find((c) => c.netforceSigner)?.netforceSigner;
      if (saved) setNetforce(saved);
      if (d.contracts?.length === 1) setContractId(d.contracts[0].id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const contract = state?.contracts.find((c) => c.id === contractId);

  function update(patch: Partial<Form>) {
    setForm((f) => {
      const next = { ...f, ...patch };
      // « Représentée par » suit le nom et la fonction tant qu'on ne l'a pas modifié à la main.
      if (!repEdited && !("representedBy" in patch)) next.representedBy = represented(next);
      return next;
    });
  }

  async function uploadTemplate(file: File) {
    if (!contract) return;
    setBusy("upload");
    setError("");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await authFetch(`/api/contracts/${contract.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: btoa(bin) }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "Import impossible.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const payload = () => ({
    contractId,
    data: form,
    partnerEmail: form.email,
    netforceSigner: netforce,
    contactId: contact?.id ?? "",
    sentBy: name,
  });

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
      setSent(`${contractId} envoyé à ${form.firstName} ${form.lastName} et ${netforce.firstName} ${netforce.lastName}.`);
      setContact(null);
      setForm(EMPTY_FORM);
      setRepEdited(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy("");
    }
  }

  const errorBox = (msg: string) => (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {msg}
    </div>
  );

  return (
    <section className="mb-10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Envoyer pour signature · Yousign</p>

      {loadError ? (
        errorBox(loadError)
      ) : !state ? (
        <div className="flex justify-center rounded-xl border border-border bg-card py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-5 rounded-xl border border-border bg-card p-4">
          {!state.configured && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Yousign n'est pas encore connecté : ajoute <code className="font-mono">YOUSIGN_API_KEY</code> dans Vercel, puis redéploie.
            </p>
          )}
          {state.env === "sandbox" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Mode test Yousign : les signatures n'ont pas de valeur légale.</p>
          )}
          {sent && (
            <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
              <Check className="h-4 w-4 shrink-0" />
              {sent} Yousign envoie l'email de signature à chacun.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {state.contracts.map((c) => (
              <button
                key={c.id}
                onClick={() => setContractId(c.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  c.id === contractId ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {contract && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {contract.uploaded
                  ? `Modèle PDF importé le ${new Date(contract.uploadedAt!).toLocaleDateString("fr-FR")}`
                  : "Le modèle PDF n'est pas encore importé."}
              </span>
              {isAdmin && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && void uploadTemplate(e.target.files[0])}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={!!busy}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-foreground hover:bg-accent disabled:opacity-40"
                  >
                    {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {contract.uploaded ? "Remplacer le modèle" : "Importer le modèle PDF"}
                  </button>
                </>
              )}
            </div>
          )}

          {contract?.uploaded && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Partie réceptrice</p>
                {contact ? (
                  <div className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5 text-sm">
                    <span className="truncate">
                      Rempli depuis la fiche de <strong>{[contact.firstName, contact.lastName].filter(Boolean).join(" ")}</strong>
                    </span>
                    <button
                      onClick={() => {
                        setContact(null);
                        setForm(EMPTY_FORM);
                        setRepEdited(false);
                      }}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Changer
                    </button>
                  </div>
                ) : (
                  <ContactSearch
                    onPick={(c) => {
                      setContact(c);
                      setForm(formFromContact(c));
                      setRepEdited(false);
                      setSent("");
                      setError("");
                    }}
                  />
                )}
              </div>

              {contact && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nom" value={form.lastName} onChange={(v) => update({ lastName: v })} />
                    <Field label="Prénom" value={form.firstName} onChange={(v) => update({ firstName: v })} />
                    <Field label="Email (reçoit le lien de signature)" type="email" value={form.email} onChange={(v) => update({ email: v })} wide />
                    <Field label="Société" value={form.company} onChange={(v) => update({ company: v })} />
                    <Field label="Fonction" value={form.jobTitle} onChange={(v) => update({ jobTitle: v })} />
                    <Field label="Siège social" value={form.address} onChange={(v) => update({ address: v })} wide />
                    <Field label="Numéro d'immatriculation (RCS, SIREN…)" value={form.registration} onChange={(v) => update({ registration: v })} />
                    <Field label="Ci-après dénommée « … »" value={form.shortName} onChange={(v) => update({ shortName: v })} />
                    <Field
                      label="Représentée par"
                      value={form.representedBy}
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
                      <input className={input} placeholder="Prénom" value={netforce.firstName} onChange={(e) => setNetforce({ ...netforce, firstName: e.target.value })} />
                      <input className={input} placeholder="Nom" value={netforce.lastName} onChange={(e) => setNetforce({ ...netforce, lastName: e.target.value })} />
                      <input className={input} type="email" placeholder="Email" value={netforce.email} onChange={(e) => setNetforce({ ...netforce, email: e.target.value })} />
                    </div>
                  </div>

                  {error && errorBox(error)}

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
                      disabled={!!busy || !state.configured}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                      {busy === "send" ? "Envoi…" : "Envoyer pour signature"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {!contact && error && errorBox(error)}
        </div>
      )}
    </section>
  );
}
