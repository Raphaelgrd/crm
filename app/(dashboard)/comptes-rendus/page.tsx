"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ClipboardList, Trash2, Mail, ChevronRight, Search } from "lucide-react";
import { useMeetings, formatMeetingDate, buildEmailBody } from "@/lib/meetings";
import type { MeetingMinutes } from "@/lib/meetings";

function DeleteDialog({ meeting, onConfirm, onCancel }: { meeting: MeetingMinutes; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="font-semibold text-base mb-2">Supprimer ce compte rendu ?</h3>
        <p className="text-sm text-muted-foreground mb-5">« {meeting.title} » sera supprimé définitivement.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors">Annuler</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity">Supprimer</button>
        </div>
      </div>
    </div>
  );
}

export default function ComptesRendusPage() {
  const { meetings, loading, deleteMeeting } = useMeetings();
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<MeetingMinutes | null>(null);

  const filtered = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.participantNames.some((n) => n.toLowerCase().includes(search.toLowerCase())),
  );

  function openMailto(m: MeetingMinutes) {
    const emails = m.participantIds
      .map((_, i) => m.participantNames[i])
      .filter(Boolean)
      .join(", ");
    const body = buildEmailBody(m.title, m.date, m.participantNames, m.summary, m.decisions, m.tasks, m.transcript);
    const subject = encodeURIComponent(`Compte rendu — ${m.title} — ${formatMeetingDate(m.date)}`);
    window.location.href = `mailto:${encodeURIComponent(emails)}?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comptes rendus</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Réunions enregistrées, transcriptions et tâches</p>
        </div>
        <Link
          href="/comptes-rendus/nouveau"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Nouvelle réunion
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Rechercher par titre ou participant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {search ? "Aucun résultat" : "Aucun compte rendu pour l'instant"}
          </p>
          {!search && (
            <Link href="/comptes-rendus/nouveau" className="text-sm text-primary hover:underline">
              Enregistrer la première réunion →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <div key={m.id} className="group bg-card border border-border rounded-xl p-4 flex items-start gap-4 hover:shadow-sm transition-shadow">
              {/* Icon */}
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="h-4 w-4" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatMeetingDate(m.date)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground mt-0.5">
                    {m.tasks.filter((t) => !t.done).length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {m.tasks.filter((t) => !t.done).length} tâche{m.tasks.filter((t) => !t.done).length > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                </div>

                {m.participantNames.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {m.participantNames.join(", ")}
                  </p>
                )}

                {m.summary && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{m.summary}</p>
                )}

                {m.decisions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.decisions.slice(0, 2).map((d, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border line-clamp-1 max-w-[200px]">
                        {d}
                      </span>
                    ))}
                    {m.decisions.length > 2 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        +{m.decisions.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openMailto(m)}
                  title="Envoyer par email"
                  className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Mail className="h-4 w-4" />
                </button>
                <Link
                  href={`/comptes-rendus/${m.id}`}
                  title="Voir le détail"
                  className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => setToDelete(m)}
                  title="Supprimer"
                  className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toDelete && (
        <DeleteDialog
          meeting={toDelete}
          onConfirm={async () => {
            await deleteMeeting(toDelete.id);
            setToDelete(null);
          }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
