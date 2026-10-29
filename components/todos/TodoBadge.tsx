"use client";

import { useCrmUser } from "@/lib/rapport";
import { dayKey, useTodos } from "@/lib/todos";

/** Nombre de mes tâches en retard ou prévues aujourd'hui (pastille du menu). */
export function TodoBadge({ compact }: { compact: boolean }) {
  const { user } = useCrmUser();
  const { todos } = useTodos();
  const today = dayKey(0);
  const mine = todos.filter((t) => t.ownerId === user?.uid && t.status !== "done" && t.due && t.due <= today);
  if (!mine.length) return null;
  const overdue = mine.some((t) => t.due < today);
  const color = overdue ? "bg-rose-500" : "bg-amber-500";
  if (compact) return <span className={`absolute top-1 right-1 h-2 w-2 rounded-full ${color}`} aria-label={`${mine.length} tâches`} />;
  return (
    <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums ${color}`}>{mine.length}</span>
  );
}
