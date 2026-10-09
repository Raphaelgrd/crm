"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

export interface MeetingTask {
  id: string;
  description: string;
  assigneeName?: string;
  assigneeId?: string;
  dueDate?: string;
  done: boolean;
}

export interface MeetingMinutes {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  participantIds: string[];
  participantNames: string[];
  transcript: string;
  summary: string;
  decisions: string[];
  tasks: MeetingTask[];
  createdAt: string;
  updatedAt: string;
}

export type MeetingMinutesInput = Omit<MeetingMinutes, "id" | "createdAt" | "updatedAt">;

const store = createCollectionStore<MeetingMinutes>("meetings");

export function makeMeetingTask(desc = ""): MeetingTask {
  return {
    id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    description: desc,
    done: false,
  };
}

function sorted(list: MeetingMinutes[]) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

export function formatMeetingDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function buildEmailBody(
  title: string,
  date: string,
  participantNames: string[],
  summary: string,
  decisions: string[],
  tasks: MeetingTask[],
  transcript: string,
): string {
  const lines: string[] = [
    `Bonjour,`,
    ``,
    `Veuillez trouver ci-dessous le compte rendu de notre réunion.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    title.toUpperCase(),
    `${formatMeetingDate(date)}`,
    participantNames.length ? `Participants : ${participantNames.join(", ")}` : "",
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ];

  if (summary) {
    lines.push(``, `RÉSUMÉ`, summary);
  }

  if (decisions.length) {
    lines.push(``, `DÉCISIONS`, ...decisions.map((d) => `• ${d}`));
  }

  if (tasks.length) {
    lines.push(``, `TÂCHES`);
    for (const t of tasks) {
      const assignee = t.assigneeName ? ` — ${t.assigneeName}` : "";
      const due = t.dueDate ? ` (avant le ${new Date(t.dueDate + "T12:00:00").toLocaleDateString("fr-FR")})` : "";
      lines.push(`${t.done ? "✓" : "☐"} ${t.description}${assignee}${due}`);
    }
  }

  if (transcript) {
    const truncated = transcript.length > 1800 ? transcript.slice(0, 1800) + "…" : transcript;
    lines.push(``, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `TRANSCRIPT`, truncated);
  }

  return lines.filter((l) => l !== null).join("\n");
}

export function useMeetings() {
  const [meetings, setMeetings] = useState<MeetingMinutes[]>(sorted(store.get()));
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setMeetings(sorted(store.get()));
        setLoading(false);
      }),
    [],
  );

  const saveMeeting = useCallback(
    async (input: MeetingMinutesInput, id?: string): Promise<MeetingMinutes> => {
      const now = new Date().toISOString();
      const existing = id ? store.get().find((m) => m.id === id) : undefined;
      const meeting: MeetingMinutes = {
        ...input,
        id: id ?? `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await store.set(meeting);
      return meeting;
    },
    [],
  );

  const patchTask = useCallback(
    async (meetingId: string, taskId: string, patch: Partial<MeetingTask>): Promise<void> => {
      const m = store.get().find((x) => x.id === meetingId);
      if (!m) return;
      await store.update(meetingId, {
        tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
        updatedAt: new Date().toISOString(),
      });
    },
    [],
  );

  const deleteMeeting = useCallback(async (id: string) => store.remove(id), []);

  return { meetings, loading, saveMeeting, patchTask, deleteMeeting };
}
