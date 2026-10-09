"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Trash2, Check, Square } from "lucide-react";
import { useMeetings, formatMeetingDate, buildEmailBody } from "@/lib/meetings";

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { meetings, loading, deleteMeeting, patchTask } = useMeetings();
  const [deleting, setDeleting] = useState(false);

  const meeting = meetings.find((m) => m.id === id);

  function openMailto() {
    if (!meeting) return;
    const emails = meeting.participantNames.join(", ");
    const body = buildEmailBody(meeting.title, meeting.date, meeting.participantNames, meeting.summary, meeting.decisions, meeting.tasks, meeting.transcript);
    const subject = encodeURIComponent(`Compte rendu — ${meeting.title} — ${formatMeetingDate(meeting.date)}`);
    window.location.href = `mailto:${encodeURIComponent(emails)}?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!meeting) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Compte rendu introuvable.</p>
        <Link href="/comptes-rendus" className="text-sm text-primary hover:underline mt-2 inline-block">← Retour à la liste</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link href="/comptes-rendus" className="mt-0.5 p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{meeting.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{formatMeetingDate(meeting.date)}</p>
          {meeting.participantNames.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">{meeting.participantNames.join(", ")}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={openMailto}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <Mail className="h-4 w-4" />
            Envoyer
          </button>
          <button
            onClick={async () => {
              if (!confirm("Supprimer ce compte rendu ?")) return;
              setDeleting(true);
              await deleteMeeting(meeting.id);
              router.push("/comptes-rendus");
            }}
            disabled={deleting}
            className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Summary */}
        {meeting.summary && (
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Résumé</h2>
            <p className="text-sm whitespace-pre-wrap">{meeting.summary}</p>
          </section>
        )}

        {/* Decisions */}
        {meeting.decisions.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Décisions</h2>
            <ul className="space-y-1.5">
              {meeting.decisions.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tasks */}
        {meeting.tasks.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tâches</h2>
            <ul className="space-y-2">
              {meeting.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3">
                  <button
                    onClick={() => void patchTask(meeting.id, t.id, { done: !t.done })}
                    className="mt-0.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
                  >
                    {t.done ? <Check className="h-4 w-4 text-green-500" /> : <Square className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0">
                    <p className={`text-sm ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.description}</p>
                    <div className="flex gap-3 mt-0.5">
                      {t.assigneeName && <span className="text-xs text-muted-foreground">{t.assigneeName}</span>}
                      {t.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          avant le {new Date(t.dueDate + "T12:00:00").toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Transcript */}
        {meeting.transcript && (
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Transcription</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{meeting.transcript}</p>
          </section>
        )}
      </div>
    </div>
  );
}
