"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Mic, MicOff, Plus, Trash2, Check, Loader2, UserPlus } from "lucide-react";
import { useMeetings, makeMeetingTask, buildEmailBody, formatMeetingDate } from "@/lib/meetings";
import type { MeetingTask, MeetingMinutesInput } from "@/lib/meetings";
import { useContacts } from "@/lib/contacts";
import type { ContactInput, Contact } from "@/lib/contacts";

// ── Web Speech API types ─────────────────────────────────────────────────────

interface ISpeechRecognitionEvent {
  results: {
    length: number;
    [i: number]: { isFinal: boolean; 0: { transcript: string } };
  };
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

// ── Participant picker ───────────────────────────────────────────────────────

function ParticipantPicker({
  selectedIds,
  selectedFree,
  onChangeIds,
  onChangeFree,
  onCreateContact,
}: {
  selectedIds: string[];
  selectedFree: string[];
  onChangeIds: (ids: string[]) => void;
  onChangeFree: (names: string[]) => void;
  onCreateContact: (input: ContactInput) => Promise<Contact>;
}) {
  const { contacts } = useContacts();
  const [query, setQuery] = useState("");

  // inline create form
  const [showCreate, setShowCreate] = useState(false);
  const [createFirst, setCreateFirst] = useState("");
  const [createLast, setCreateLast] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = query
    ? contacts
        .filter((c) =>
          `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  const showDropdown = query.length > 0 && !showCreate;

  function toggleContact(id: string) {
    onChangeIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function openCreate() {
    const parts = query.trim().split(/\s+/);
    setCreateFirst(parts[0] ?? "");
    setCreateLast(parts.slice(1).join(" "));
    setCreateEmail("");
    setShowCreate(true);
    setQuery("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const first = createFirst.trim();
    const last = createLast.trim();
    if (!first) return;
    setCreating(true);
    try {
      const contact = await onCreateContact({
        firstName: first,
        lastName: last,
        email: createEmail.trim(),
        phone: "",
        company: "",
        category: "Prospect",
        stage: "Nouveau",
        notes: "",
      });
      onChangeIds([...selectedIds, contact.id]);
      setShowCreate(false);
      setCreateFirst("");
      setCreateLast("");
      setCreateEmail("");
    } finally {
      setCreating(false);
    }
  }

  const selectedContacts = contacts.filter((c) => selectedIds.includes(c.id));

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {(selectedContacts.length > 0 || selectedFree.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {selectedContacts.map((c) => (
            <span key={c.id} className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
              {c.firstName} {c.lastName}
              <button type="button" onClick={() => toggleContact(c.id)} className="hover:opacity-70">×</button>
            </span>
          ))}
          {selectedFree.map((n) => (
            <span key={n} className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground border border-border">
              {n}
              <button type="button" onClick={() => onChangeFree(selectedFree.filter((x) => x !== n))} className="hover:opacity-70">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      {!showCreate && (
        <input
          type="text"
          placeholder="Chercher ou créer un participant…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { toggleContact(c.id); setQuery(""); }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-accent transition-colors ${selectedIds.includes(c.id) ? "bg-primary/5" : ""}`}
            >
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                {c.firstName[0]}{c.lastName[0]}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{c.firstName} {c.lastName}</p>
                {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
              </div>
              {selectedIds.includes(c.id) && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
            </button>
          ))}
          {/* Create option */}
          <button
            type="button"
            onClick={openCreate}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-primary hover:bg-primary/5 transition-colors"
          >
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
            </div>
            <span>
              {filtered.length === 0
                ? `Créer « ${query} »`
                : `Créer un nouveau contact`}
            </span>
          </button>
        </div>
      )}

      {/* Inline create form */}
      {showCreate && (
        <form onSubmit={(e) => void handleCreate(e)} className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" /> Nouveau contact
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              autoFocus
              required
              type="text"
              placeholder="Prénom *"
              value={createFirst}
              onChange={(e) => setCreateFirst(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="text"
              placeholder="Nom"
              value={createLast}
              onChange={(e) => setCreateLast(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <input
            type="email"
            placeholder="Email (optionnel)"
            value={createEmail}
            onChange={(e) => setCreateEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setQuery(""); }}
              className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating || !createFirst.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Créer et ajouter
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  contacts,
  onChange,
  onDelete,
}: {
  task: MeetingTask;
  contacts: { id: string; firstName: string; lastName: string }[];
  onChange: (patch: Partial<MeetingTask>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-start">
      <input
        type="text"
        placeholder="Description de la tâche…"
        value={task.description}
        onChange={(e) => onChange({ description: e.target.value })}
        className="px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <select
        value={task.assigneeId ?? ""}
        onChange={(e) => {
          const c = contacts.find((x) => x.id === e.target.value);
          onChange({ assigneeId: c?.id ?? undefined, assigneeName: c ? `${c.firstName} ${c.lastName}` : undefined });
        }}
        className="px-2 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring max-w-[140px]"
      >
        <option value="">Responsable…</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
        ))}
      </select>
      <input
        type="date"
        value={task.dueDate ?? ""}
        onChange={(e) => onChange({ dueDate: e.target.value || undefined })}
        className="px-2 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button type="button" onClick={onDelete} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main wizard ──────────────────────────────────────────────────────────────

const STEPS = ["Infos", "Enregistrement", "Contenu"] as const;

export default function NewMeetingPage() {
  const router = useRouter();
  const { saveMeeting } = useMeetings();
  const { contacts, addContact } = useContacts();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — info
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantFree, setParticipantFree] = useState<string[]>([]);

  // Step 2 — recording
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const recRef = useRef<ISpeechRecognition | null>(null);
  const shouldRestartRef = useRef(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [extraSpeakers, setExtraSpeakers] = useState<string[]>([]);
  const [speakerInput, setSpeakerInput] = useState("");
  const [showSpeakerInput, setShowSpeakerInput] = useState(false);

  // Step 3 — content
  const [summary, setSummary] = useState("");
  const [decisions, setDecisions] = useState<string[]>([""]);
  const [tasks, setTasks] = useState<MeetingTask[]>([makeMeetingTask()]);

  // ── Speech helpers ──

  const buildRecognition = useCallback((): ISpeechRecognition | null => {
    const Rec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Rec) { setSpeechSupported(false); return null; }
    const rec = new Rec();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    return rec;
  }, []);

  const startRecognition = useCallback(() => {
    const rec = buildRecognition();
    if (!rec) return;
    recRef.current = rec;

    rec.onresult = (ev: ISpeechRecognitionEvent) => {
      let final = "";
      let inter = "";
      for (let i = 0; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " ";
        else inter += ev.results[i][0].transcript;
      }
      if (final) setTranscript((p) => p + final);
      setInterim(inter);
    };

    rec.onerror = () => { /* ignore */ };

    rec.onend = () => {
      setInterim("");
      if (shouldRestartRef.current) {
        // Auto-restart on silence (Chrome stops after ~60 s)
        setTimeout(() => {
          if (shouldRestartRef.current) startRecognition();
        }, 200);
      } else {
        setIsRecording(false);
      }
    };

    rec.start();
    setIsRecording(true);
  }, [buildRecognition]);

  const stopRecognition = useCallback(() => {
    shouldRestartRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  function toggleRecording() {
    if (isRecording) {
      stopRecognition();
    } else {
      shouldRestartRef.current = true;
      startRecognition();
    }
  }

  function insertSpeaker(name: string) {
    setCurrentSpeaker(name);
    setTranscript((p) => {
      const trimmed = p.trimEnd();
      return trimmed ? `${trimmed}\n\n${name} : ` : `${name} : `;
    });
    setInterim("");
  }

  function addExtraSpeaker() {
    const name = speakerInput.trim();
    if (!name) return;
    setExtraSpeakers((p) => (p.includes(name) ? p : [...p, name]));
    setSpeakerInput("");
    setShowSpeakerInput(false);
    insertSpeaker(name);
  }

  // Stop recording when leaving step
  useEffect(() => {
    if (step !== 1 && isRecording) stopRecognition();
  }, [step, isRecording, stopRecognition]);

  // ── Save ──

  async function handleSave(sendEmail: boolean) {
    setSaving(true);
    try {
      const participantContacts = contacts.filter((c) => participantIds.includes(c.id));
      const allNames = [
        ...participantContacts.map((c) => `${c.firstName} ${c.lastName}`),
        ...participantFree,
      ];

      const input: MeetingMinutesInput = {
        title,
        date,
        participantIds,
        participantNames: allNames,
        transcript,
        summary,
        decisions: decisions.filter((d) => d.trim()),
        tasks: tasks.filter((t) => t.description.trim()),
      };

      const saved = await saveMeeting(input);

      if (sendEmail) {
        const emails = participantContacts.map((c) => c.email).filter(Boolean).join(",");
        const body = buildEmailBody(saved.title, saved.date, allNames, saved.summary, saved.decisions, saved.tasks, saved.transcript);
        const subject = encodeURIComponent(`Compte rendu — ${saved.title} — ${formatMeetingDate(saved.date)}`);
        window.location.href = `mailto:${encodeURIComponent(emails)}?subject=${subject}&body=${encodeURIComponent(body)}`;
        setTimeout(() => router.push("/comptes-rendus"), 300);
      } else {
        router.push("/comptes-rendus");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/comptes-rendus" className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Nouvelle réunion</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border mx-1" />}
          </div>
        ))}
      </div>

      {/* ── Step 0: Info ── */}
      {step === 0 && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">Titre de la réunion *</label>
            <input
              type="text"
              autoFocus
              placeholder="ex : Réunion hebdo équipe, Point client…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2.5 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Participants</label>
            <ParticipantPicker
              selectedIds={participantIds}
              selectedFree={participantFree}
              onChangeIds={setParticipantIds}
              onChangeFree={setParticipantFree}
              onCreateContact={addContact}
            />
          </div>
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setStep(1)}
              disabled={!title.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Suivant <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Recording ── */}
      {step === 1 && (() => {
        const participantContacts = contacts.filter((c) => participantIds.includes(c.id));
        const allSpeakers = [
          ...participantContacts.map((c) => `${c.firstName} ${c.lastName}`),
          ...participantFree,
          ...extraSpeakers,
        ];
        return (
          <div className="space-y-5">
            {!speechSupported && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-medium mb-1">Transcription non disponible</p>
                <p>Ton navigateur ne supporte pas la Web Speech API. Utilise Chrome ou Edge. Tu peux aussi saisir la transcription manuellement ci-dessous.</p>
              </div>
            )}

            {speechSupported && (
              <>
                {/* Mic button */}
                <div className="flex flex-col items-center pt-4 pb-2 gap-3">
                  <button
                    onClick={toggleRecording}
                    className={`h-20 w-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
                      isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : "bg-primary hover:opacity-90"
                    }`}
                  >
                    {isRecording ? <MicOff className="h-8 w-8 text-white" /> : <Mic className="h-8 w-8 text-white" />}
                  </button>
                  <p className="text-sm text-muted-foreground">
                    {isRecording ? "Enregistrement en cours… Clique pour arrêter" : "Clique pour démarrer l'enregistrement"}
                  </p>
                </div>

                {/* Speaker chips */}
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Clique sur un nom dès que cette personne commence à parler
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allSpeakers.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => insertSpeaker(name)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          currentSpeaker === name
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "border-border bg-card hover:bg-accent"
                        }`}
                      >
                        {name}
                      </button>
                    ))}

                    {showSpeakerInput ? (
                      <div className="flex gap-1">
                        <input
                          autoFocus
                          type="text"
                          value={speakerInput}
                          onChange={(e) => setSpeakerInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addExtraSpeaker(); }
                            if (e.key === "Escape") { setShowSpeakerInput(false); setSpeakerInput(""); }
                          }}
                          placeholder="Nom…"
                          className="w-28 px-2 py-1 text-sm border border-border rounded-full bg-input focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button type="button" onClick={addExtraSpeaker} className="px-2 py-1 text-sm rounded-full bg-primary text-primary-foreground hover:opacity-90">
                          OK
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSpeakerInput(true)}
                        className="px-3 py-1.5 text-sm rounded-full border border-dashed border-border text-muted-foreground hover:bg-accent transition-colors"
                      >
                        + Autre
                      </button>
                    )}
                  </div>

                  {isRecording && currentSpeaker && (
                    <p className="text-xs text-muted-foreground">
                      🎙 <span className="font-medium text-foreground">{currentSpeaker}</span> parle…
                      {interim && <span className="italic"> {interim}</span>}
                    </p>
                  )}
                  {isRecording && !currentSpeaker && interim && (
                    <p className="text-xs text-muted-foreground italic">{interim}</p>
                  )}
                </div>
              </>
            )}

            {/* Editable transcript */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Transcription{isRecording ? " (en direct)" : ""}
              </label>
              <textarea
                rows={10}
                placeholder="La transcription s'affiche ici automatiquement. Tu peux aussi la saisir ou la coller manuellement."
                value={transcript + (!currentSpeaker && isRecording && interim ? interim : "")}
                onChange={(e) => { if (!isRecording) setTranscript(e.target.value); }}
                readOnly={isRecording}
                className={`w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono ${isRecording ? "opacity-80 cursor-default" : ""}`}
              />
            </div>

            <div className="flex justify-between gap-3">
              <button onClick={() => setStep(0)} className="px-4 py-2.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors">
                Retour
              </button>
              <button
                onClick={() => { if (isRecording) stopRecognition(); setStep(2); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                Suivant <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Step 2: Content ── */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Summary */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Résumé</label>
            <textarea
              rows={4}
              placeholder="Résumé des points clés de la réunion…"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Decisions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Décisions</label>
              <button
                type="button"
                onClick={() => setDecisions([...decisions, ""])}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {decisions.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`Décision ${i + 1}…`}
                    value={d}
                    onChange={(e) => {
                      const next = [...decisions];
                      next[i] = e.target.value;
                      setDecisions(next);
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setDecisions(decisions.filter((_, j) => j !== i))}
                    disabled={decisions.length === 1}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Tâches</label>
              <button
                type="button"
                onClick={() => setTasks([...tasks, makeMeetingTask()])}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            <div className="space-y-2 overflow-x-auto">
              {tasks.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  contacts={contacts}
                  onChange={(patch) => {
                    const next = [...tasks];
                    next[i] = { ...t, ...patch };
                    setTasks(next);
                  }}
                  onDelete={() => setTasks(tasks.length > 1 ? tasks.filter((_, j) => j !== i) : [makeMeetingTask()])}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-3 pt-2">
            <button onClick={() => setStep(1)} className="px-4 py-2.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors">
              Retour
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => void handleSave(false)}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sauvegarder
              </button>
              <button
                onClick={() => void handleSave(true)}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sauvegarder et envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
