"use client";

import { useState, useMemo } from "react";
import { Send, Users, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { useContacts, DEFAULT_CATEGORIES, type Contact } from "@/lib/contacts";
import type { SendEmailPayload } from "@/app/api/emails/send/route";

type Segment = "tous" | "investisseurs" | `cat:${string}` | `tag:${string}`;

function segmentLabel(seg: Segment, contacts: Contact[]): string {
  if (seg === "tous") return "Tous les contacts";
  if (seg === "investisseurs") return "Investisseurs (avec mise)";
  if (seg.startsWith("cat:")) return `Catégorie : ${seg.slice(4)}`;
  if (seg.startsWith("tag:")) return `Tag : ${seg.slice(4)}`;
  return seg;
}

function filterBySegment(contacts: Contact[], seg: Segment): Contact[] {
  if (seg === "tous") return contacts;
  if (seg === "investisseurs")
    return contacts.filter(
      (c) => parseInt((c.extra?.["Investissement"] ?? "").replace(/[\s ]/g, ""), 10) > 0
    );
  if (seg.startsWith("cat:")) return contacts.filter((c) => c.category === seg.slice(4));
  if (seg.startsWith("tag:")) return contacts.filter((c) => (c.tags ?? []).includes(seg.slice(4)));
  return contacts;
}

interface SendResult {
  sent: number;
  failed: number;
  results: { email: string; success: boolean; error?: string }[];
}

export default function EmailsPage() {
  const { contacts } = useContacts();

  const [segment, setSegment] = useState<Segment>("tous");
  const [fromName, setFromName] = useState("Raphaël — Netforce Défense");
  const [replyTo, setReplyTo] = useState("raphael@netforce-defense.com");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [step, setStep] = useState<"compose" | "preview" | "sending" | "done">("compose");
  const [result, setResult] = useState<SendResult | null>(null);
  const [showFailed, setShowFailed] = useState(false);

  const allTags = useMemo(
    () => Array.from(new Set(contacts.flatMap((c) => c.tags ?? []))).sort(),
    [contacts]
  );

  const recipients = useMemo(() => {
    const base = filterBySegment(contacts, segment);
    return base.filter((c) => c.email && c.email.includes("@") && c.stage !== "Doublon");
  }, [contacts, segment]);

  const segments: { value: Segment; label: string; count: number }[] = [
    { value: "tous", label: "Tous les contacts", count: filterBySegment(contacts, "tous").filter(c => c.email && c.stage !== "Doublon").length },
    { value: "investisseurs", label: "Investisseurs (avec mise)", count: filterBySegment(contacts, "investisseurs").filter(c => c.email && c.stage !== "Doublon").length },
    ...DEFAULT_CATEGORIES.map((cat) => ({
      value: `cat:${cat}` as Segment,
      label: `Catégorie : ${cat}`,
      count: filterBySegment(contacts, `cat:${cat}` as Segment).filter(c => c.email && c.stage !== "Doublon").length,
    })),
    ...allTags.map((tag) => ({
      value: `tag:${tag}` as Segment,
      label: `Tag : ${tag}`,
      count: filterBySegment(contacts, `tag:${tag}` as Segment).filter(c => c.email && c.stage !== "Doublon").length,
    })),
  ];

  const previewHtml = body
    .replace(/\{\{prénom\}\}/g, "Jean")
    .replace(/\{\{nom\}\}/g, "Dupont")
    .replace(/\{\{email\}\}/g, "jean.dupont@exemple.fr")
    .replace(/\n/g, "<br/>");

  const handleSend = async () => {
    setStep("sending");
    const payload: SendEmailPayload = {
      recipients: recipients.map((c) => ({
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
      })),
      subject,
      html: body.replace(/\n/g, "<br/>"),
      fromName,
      replyTo: replyTo || undefined,
    };

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: SendResult = await res.json();
      setResult(data);
      setStep("done");
    } catch {
      setResult({ sent: 0, failed: recipients.length, results: [] });
      setStep("done");
    }
  };

  if (step === "done" && result) {
    const failedList = result.results.filter((r) => !r.success);
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="bg-card border-border rounded-2xl border p-8 text-center shadow-sm">
          {result.sent > 0 ? (
            <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
          ) : (
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          )}
          <h1 className="text-foreground mb-2 text-xl font-bold">Campagne envoyée</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            <span className="text-green-600 font-semibold">{result.sent} envoyés</span>
            {result.failed > 0 && (
              <> · <span className="text-red-500 font-semibold">{result.failed} échoués</span></>
            )}
          </p>

          {failedList.length > 0 && (
            <div className="mb-6 text-left">
              <button
                type="button"
                onClick={() => setShowFailed((v) => !v)}
                className="text-muted-foreground flex items-center gap-1 text-xs font-medium hover:underline"
              >
                {showFailed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Voir les {failedList.length} erreurs
              </button>
              {showFailed && (
                <div className="bg-muted mt-2 rounded-lg p-3 text-xs space-y-1">
                  {failedList.map((r) => (
                    <div key={r.email} className="flex gap-2">
                      <span className="text-red-500 shrink-0">✗</span>
                      <span className="text-foreground">{r.email}</span>
                      {r.error && <span className="text-muted-foreground">— {r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => { setStep("compose"); setResult(null); setSubject(""); setBody(""); }}
            className="bg-primary text-primary-foreground rounded-lg px-5 py-2 text-sm font-semibold hover:opacity-90"
          >
            Nouvelle campagne
          </button>
        </div>
      </div>
    );
  }

  if (step === "sending") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="text-primary mx-auto mb-4 h-10 w-10 animate-spin" />
          <p className="text-foreground font-semibold">Envoi en cours…</p>
          <p className="text-muted-foreground mt-1 text-sm">{recipients.length} destinataires</p>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-foreground text-xl font-bold">Aperçu avant envoi</h1>
          <button
            type="button"
            onClick={() => setStep("compose")}
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Modifier
          </button>
        </div>

        <div className="bg-card border-border mb-4 rounded-xl border p-5 shadow-sm">
          <div className="mb-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">De :</span>
              <span className="text-foreground">{fromName} &lt;contact@mail.netforce-defense.com&gt;</span>
            </div>
            {replyTo && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Répondre à :</span>
                <span className="text-foreground">{replyTo}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Objet :</span>
              <span className="text-foreground font-medium">{subject}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Destinat. :</span>
              <span className="text-foreground">{recipients.length} contacts ({segmentLabel(segment, contacts)})</span>
            </div>
          </div>
          <div className="border-border border-t pt-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">Aperçu (Jean Dupont)</p>
            <div
              className="text-foreground prose prose-sm max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-[11px] text-gray-400">
                Vous recevez cet email car vous faites partie du réseau Netforce Défense.{" "}
                <span className="underline">Se désabonner</span>
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold hover:opacity-90"
        >
          <Send className="h-4 w-4" />
          Envoyer à {recipients.length} contacts
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Mail className="text-primary h-6 w-6" />
        <h1 className="text-foreground text-xl font-bold">Nouvelle campagne email</h1>
      </div>

      <div className="space-y-4">
        {/* Segment */}
        <div className="bg-card border-border rounded-xl border p-5 shadow-sm">
          <label className="text-foreground mb-3 block text-sm font-semibold">
            <Users className="mb-0.5 mr-1.5 inline h-4 w-4" />
            Destinataires
          </label>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value as Segment)}
            className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {segments.filter((s) => s.count > 0).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} ({s.count})
              </option>
            ))}
          </select>
          <p className="text-muted-foreground mt-2 text-xs">
            {recipients.length} contact{recipients.length > 1 ? "s" : ""} avec une adresse email valide
          </p>
        </div>

        {/* Expéditeur */}
        <div className="bg-card border-border rounded-xl border p-5 shadow-sm">
          <p className="text-foreground mb-3 block text-sm font-semibold">Expéditeur</p>
          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">Nom affiché</label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">Adresse de réponse (optionnel)</label>
              <input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="raphael@netforce-defense.com"
                className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Contenu */}
        <div className="bg-card border-border rounded-xl border p-5 shadow-sm">
          <p className="text-foreground mb-3 block text-sm font-semibold">Contenu</p>
          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">Objet</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet de votre email…"
                className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Corps du message{" "}
                <span className="text-blue-500">
                  — utilise {"{{"} prénom {"}}"}, {"{{"} nom {"}}"} pour personnaliser
                </span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder={"Bonjour {{prénom}},\n\n…"}
                className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!subject.trim() || !body.trim() || recipients.length === 0}
          onClick={() => setStep("preview")}
          className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aperçu & Envoi →
        </button>
      </div>
    </div>
  );
}
