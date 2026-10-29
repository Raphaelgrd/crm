"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Download, ExternalLink, FolderLock, Loader2, Mail, RotateCcw, Send, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDataRoom } from "@/lib/dataroom";
import { authFetch, useCrmUser, useTeamMembers } from "@/lib/rapport";
import { escapeHtml } from "@/lib/escapeHtml";

type Recipient = { id: string; email: string; firstName: string; lastName: string };
type Action =
  | { type: "email_draft"; recipients: Recipient[]; subject: string; body: string }
  | { type: "navigate"; path: string; label: string }
  | { type: "open_file" | "download_file"; fileId: string; name: string };

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
}

/** Rendu minimal : **gras** et retours à la ligne. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function bodyToHtml(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function EmailDraftCard({ draft, fromName, replyTo }: { draft: Extract<Action, { type: "email_draft" }>; fromName: string; replyTo: string }) {
  const [recipients, setRecipients] = useState(draft.recipients);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [state, setState] = useState<"idle" | "confirm" | "sending" | "sent" | "error">("idle");
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const locked = state === "sending" || state === "sent";

  const send = async () => {
    setState("sending");
    try {
      const res = await authFetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, subject, html: bodyToHtml(body), fromName, replyTo }),
      });
      const out = (await res.json()) as { sent?: number; failed?: number; error?: string };
      if (!res.ok) throw new Error(out.error ?? "Envoi impossible.");
      setResult(`${out.sent ?? 0} envoyé${(out.sent ?? 0) > 1 ? "s" : ""}${out.failed ? `, ${out.failed} en échec` : ""}`);
      setState("sent");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Envoi impossible.");
      setState("error");
    }
  };

  return (
    <div className="border-border bg-card w-full max-w-xl overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border flex items-center gap-2 border-b bg-violet-50/60 px-4 py-2 dark:bg-violet-950/20">
        <Mail className="h-4 w-4 text-violet-600" aria-hidden="true" />
        <span className="text-foreground text-sm font-semibold">Brouillon d&apos;email</span>
        <span className="text-muted-foreground ml-auto text-xs">Rien n&apos;est envoyé sans ton clic</span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">À :</span>
          {recipients.map((r) => (
            <span key={r.id} className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
              {`${r.firstName} ${r.lastName}`.trim() || r.email}
              {!locked && recipients.length > 1 && (
                <button type="button" onClick={() => setRecipients((l) => l.filter((x) => x.id !== r.id))} aria-label="Retirer">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
        <input
          value={subject}
          disabled={locked}
          onChange={(e) => setSubject(e.target.value)}
          className="border-border bg-card w-full rounded-lg border px-3 py-2 text-sm font-semibold focus:outline-none"
          aria-label="Objet"
        />
        <textarea
          value={body}
          disabled={locked}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(14, Math.max(6, body.split("\n").length + 1))}
          className="border-border bg-card w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed focus:outline-none"
          aria-label="Message"
        />
        <p className="text-muted-foreground text-[11px]">
          {"{{prénom}}"} et {"{{nom}}"} sont remplacés pour chaque destinataire. Un lien de désabonnement est ajouté automatiquement.
        </p>
        {result && <p className={`text-sm ${state === "sent" ? "text-emerald-600" : "text-red-600"}`}>{result}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {state === "sent" ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
              <Check className="h-4 w-4" aria-hidden="true" /> Envoyé
            </span>
          ) : state === "confirm" ? (
            <>
              <button type="button" onClick={() => void send()} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                Confirmer l&apos;envoi à {recipients.length} contact{recipients.length > 1 ? "s" : ""}
              </button>
              <button type="button" onClick={() => setState("idle")} className="text-muted-foreground hover:bg-muted rounded-lg px-3 py-2 text-sm">
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={state === "sending" || !subject.trim() || !body.trim()}
              onClick={() => setState("confirm")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              Envoyer
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(`${subject}\n\n${body}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const router = useRouter();
  const { user, name, isAdmin } = useCrmUser();
  const { members } = useTeamMembers();
  const { files, openFile, downloadFile } = useDataRoom();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text = input.trim()) => {
    if (!text || loading) return;
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await authFetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          me: { uid: user?.uid ?? "", name },
          team: members.filter((m) => !m.isBot).map((m) => ({ uid: m.uid, name: m.name })),
          files: files.map((f) => ({ id: f.id, name: f.name, folder: f.folder, size: f.size })),
        }),
      });
      const data = (await res.json()) as { reply?: string; actions?: Action[]; error?: string };
      setMessages([...next, { role: "assistant", content: data.reply ?? data.error ?? "Erreur inconnue.", actions: data.actions }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Impossible de joindre l'assistant. Vérifie ta connexion." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const SUGGESTIONS = isAdmin
    ? [
        "Qui dois-je relancer cette semaine ?",
        "Rédige un email de relance aux investisseurs de la société Mutares",
        "Crée un modèle d'email de présentation des gants Impact pour les distributeurs",
        "Rappelle-moi d'appeler Laurent demain, priorité haute",
        "Résume l'activité de l'équipe aujourd'hui",
        "Passe Sébastien Fortage en catégorie Partenaire",
      ]
    : ["Combien de contacts dans le pipeline ?", "Quelles sont mes tâches du jour ?", "Montre-moi les investisseurs", "Quel est le stock de gants ?"];

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-100 p-2 dark:bg-violet-950/40">
            <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-foreground text-lg font-bold">Assistant CRM</h1>
            <p className="text-muted-foreground text-xs">
              {isAdmin
                ? "Accès complet : contacts, pipeline, emails, modèles, tâches, agenda, équipe…"
                : "Pose une question sur le CRM ou gère tes tâches"}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Effacer
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="rounded-2xl bg-violet-100 p-5 dark:bg-violet-950/40">
              <Bot className="h-10 w-10 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-foreground text-lg font-semibold">Bonjour {name || ""} !</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {isAdmin
                  ? "Je peux lire et modifier tout le CRM, rédiger tes emails et tes modèles, et gérer les tâches de l'équipe."
                  : "Je connais les contacts, le pipeline et tes tâches. Demande-moi n'importe quoi."}
              </p>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="border-border bg-card hover:bg-muted text-foreground rounded-xl border px-4 py-3 text-left text-sm transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div key={i} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-primary text-primary-foreground" : "bg-violet-100 dark:bg-violet-950/40"}`}>
                {isUser ? <User className="h-4 w-4" aria-hidden="true" /> : <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />}
              </div>
              <div className={`flex max-w-[80%] flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
                {msg.content && (
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"}`}>
                    <RichText text={msg.content} />
                  </div>
                )}
                {msg.actions?.map((a, j) =>
                  a.type === "email_draft" ? (
                    <EmailDraftCard key={j} draft={a} fromName={`${name || "Netforce"} · Netforce`} replyTo={user?.email ?? ""} />
                  ) : (
                    <button
                      key={j}
                      type="button"
                      onClick={() => {
                        if (a.type === "navigate") router.push(a.path);
                        if (a.type === "open_file") void openFile(a.fileId);
                        if (a.type === "download_file") void downloadFile(a.fileId);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
                    >
                      {a.type === "navigate" && <ExternalLink className="h-3 w-3" aria-hidden="true" />}
                      {a.type === "open_file" && <FolderLock className="h-3 w-3" aria-hidden="true" />}
                      {a.type === "download_file" && <Download className="h-3 w-3" aria-hidden="true" />}
                      {a.type === "navigate" ? a.label : a.type === "open_file" ? `Ouvrir ${a.name}` : `Télécharger ${a.name}`}
                    </button>
                  ),
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/40">
              <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            </div>
            <div className="bg-muted flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" aria-hidden="true" />
              <span className="text-muted-foreground text-sm">Je travaille dessus…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-border border-t p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={isAdmin ? "Demande n'importe quoi : un email, un modèle, une tâche, une modification…" : "Pose une question ou demande une action…"}
            rows={1}
            className="border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-primary/20 flex-1 resize-none rounded-xl border px-4 py-3 text-sm focus:ring-2 focus:outline-none"
            style={{ minHeight: "48px", maxHeight: "160px" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-primary text-primary-foreground flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label="Envoyer"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        <p className="text-muted-foreground mt-2 text-center text-xs">Entrée pour envoyer · Maj+Entrée pour nouvelle ligne</p>
      </div>
    </div>
  );
}
