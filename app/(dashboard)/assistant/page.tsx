"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, User, Loader2, FolderLock, ExternalLink, Download, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createCollectionStore } from "@/lib/firebase";
import { useDataRoom } from "@/lib/dataroom";
import type { Contact } from "@/lib/contacts";
import type { FolderMeta } from "@/lib/dataroom";
import { authFetch } from "@/lib/rapport";

const contactStore = createCollectionStore<Contact>("contacts");

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Action {
  action: "navigate" | "open_file" | "download_file";
  path?: string;
  fileId?: string;
}

function parseAction(text: string): { clean: string; actions: Action[] } {
  const actions: Action[] = [];
  const clean = text.replace(/\{\"action\":[^}]+\}/g, (match) => {
    try {
      actions.push(JSON.parse(match) as Action);
    } catch { /* ignore */ }
    return "";
  }).trim();
  return { clean, actions };
}

export default function AssistantPage() {
  const router = useRouter();
  const { files, folderMetas, openFile, downloadFile } = useDataRoom();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return contactStore.subscribe(() => setContacts([...contactStore.get()]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const buildContext = () => ({
    contacts: contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      company: c.company,
      category: c.category,
      stage: c.stage,
      tags: c.tags,
      notes: c.notes,
      nextFollowUpAt: c.nextFollowUpAt,
    })),
    folders: folderMetas.map((f: FolderMeta) => ({
      name: f.name,
      visibility: f.visibility,
      fileCount: files.filter((file) => file.folder === f.name || file.folder.startsWith(f.name + "/")).length,
    })),
    files: files.map((f) => ({ id: f.id, name: f.name, folder: f.folder, size: f.size, mime: f.mime, createdAt: f.createdAt })),
  });

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await authFetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          crmContext: buildContext(),
        }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      const reply = data.reply ?? data.error ?? "Erreur inconnue.";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Impossible de joindre l'assistant. Vérifie ta connexion." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleAction = (action: Action) => {
    if (action.action === "navigate" && action.path) router.push(action.path);
    if (action.action === "open_file" && action.fileId) void openFile(action.fileId);
    if (action.action === "download_file" && action.fileId) void downloadFile(action.fileId);
  };

  const SUGGESTIONS = [
    "Combien de contacts dans le pipeline ?",
    "Liste les fichiers du Kit Marketing FR",
    "Qui est le prochain contact à relancer ?",
    "Montre-moi les investisseurs",
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-100 p-2 dark:bg-violet-950/40">
            <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-foreground text-lg font-bold">Assistant CRM</h1>
            <p className="text-muted-foreground text-xs">Pose une question ou demande une action sur le CRM</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Effacer
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="rounded-2xl bg-violet-100 p-5 dark:bg-violet-950/40">
              <Bot className="h-10 w-10 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-foreground font-semibold text-lg">Bonjour ! Je suis votre assistant CRM.</p>
              <p className="text-muted-foreground text-sm mt-1">Je connais tous vos contacts, dossiers et fichiers. Demandez-moi n&apos;importe quoi.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                  className="border-border bg-card hover:bg-muted text-foreground rounded-xl border px-4 py-3 text-sm text-left transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          const { clean, actions } = parseAction(msg.content);
          return (
            <div key={i} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
              <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full ${isUser ? "bg-primary text-primary-foreground" : "bg-violet-100 dark:bg-violet-950/40"}`}>
                {isUser ? <User className="h-4 w-4" aria-hidden="true" /> : <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />}
              </div>
              <div className={`max-w-[75%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"}`}>
                  {clean}
                </div>
                {actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action, j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => handleAction(action)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                      >
                        {action.action === "navigate" && <ExternalLink className="h-3 w-3" aria-hidden="true" />}
                        {action.action === "open_file" && <FolderLock className="h-3 w-3" aria-hidden="true" />}
                        {action.action === "download_file" && <Download className="h-3 w-3" aria-hidden="true" />}
                        {action.action === "navigate" ? `Aller vers ${action.path}` : action.action === "open_file" ? "Ouvrir le fichier" : "Télécharger"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/40">
              <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground text-sm">Recherche en cours…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-border border-t p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); void send(); }}
          className="flex gap-2 items-end"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Pose une question ou demande une action…"
            rows={1}
            className="border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-primary/20 flex-1 resize-none rounded-xl border px-4 py-3 text-sm focus:ring-2 focus:outline-none"
            style={{ minHeight: "48px", maxHeight: "160px" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-primary text-primary-foreground disabled:opacity-40 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-opacity hover:opacity-90"
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
