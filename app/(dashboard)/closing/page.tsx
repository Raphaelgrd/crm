"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Filter, Mail, Calendar, Eye } from "lucide-react";
import {
  Contact,
  STAGES,
  StageName,
  contactFullName,
  contactInitial,
  useContacts,
} from "@/lib/contacts";

// Colonnes et couleurs fidèles à la page d'origine ; les cartes sont
// les vrais contacts (lib/contacts.ts), déplaçables entre colonnes.

type Period = "all" | "today" | "week" | "month";

function inPeriod(iso: string, period: Period): boolean {
  if (period === "all") return true;
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") return d >= startOfDay;
  if (period === "week") {
    const monday = new Date(startOfDay);
    monday.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
    return d >= monday;
  }
  return d >= new Date(now.getFullYear(), now.getMonth(), 1);
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Il y a 1 jour";
  if (days < 30) return `Il y a ${days} jours`;
  const months = Math.floor(days / 30);
  return `Il y a ${months} mois`;
}

export default function ClosingPage() {
  const router = useRouter();
  const { contacts, updateContact } = useContacts();
  const [period, setPeriod] = useState<Period>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageName | null>(null);

  const byStage = useMemo(() => {
    const map = new Map<StageName, Contact[]>();
    for (const s of STAGES) map.set(s.name, []);
    for (const c of contacts) {
      if (!inPeriod(c.createdAt, period)) continue;
      (map.get(c.stage) ?? map.get("Nouveau"))!.push(c);
    }
    return map;
  }, [contacts, period]);

  const handleDrop = async (stage: StageName) => {
    const id = dragId;
    setDragId(null);
    setDragOverStage(null);
    if (!id) return;
    const contact = contacts.find((c) => c.id === id);
    if (contact && contact.stage !== stage) {
      await updateContact(id, { stage });
    }
  };

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-foreground text-xl font-bold sm:text-2xl">
                Pipeline de Closing
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Visualisez et gérez vos opportunités commerciales
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    Période:
                  </span>
                  <div className="relative">
                    <Filter
                      className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <select
                      value={period}
                      onChange={(e) => setPeriod(e.target.value as Period)}
                      className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border py-1.5 pr-2 pl-7 text-sm focus:ring-2 focus:outline-none"
                    >
                      <option value="all">Toutes</option>
                      <option value="today">Aujourd&apos;hui</option>
                      <option value="week">Cette semaine</option>
                      <option value="month">Ce mois</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    Commercial:
                  </span>
                  <select className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none">
                    <option value="all">Tous</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium">
                    Télépro:
                  </span>
                  <select className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none">
                    <option value="all">Tous</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              className="border-border bg-card text-foreground hover:bg-muted focus-visible:ring-primary inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Configurer
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto px-4 pt-4 pb-4 sm:px-6 sm:pt-6 sm:pb-6">
        {STAGES.map((stage) => {
          const cards = byStage.get(stage.name) ?? [];
          const isOver = dragOverStage === stage.name;
          return (
            <div
              key={stage.name}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.name);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(stage.name);
              }}
              className={
                "bg-muted flex h-auto max-h-[calc(100vh-220px)] shrink-0 flex-col rounded-xl shadow-sm transition-colors " +
                (isOver ? "ring-primary ring-2" : "")
              }
              style={{ width: 320 }}
            >
              <div
                className="flex shrink-0 items-center justify-between rounded-t-xl px-4 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: stage.color }}
              >
                <div className="flex items-center gap-2">
                  <span>{stage.name}</span>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                    {cards.length}
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDragId(card.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverStage(null);
                    }}
                    className={
                      "border-border bg-card relative cursor-grab rounded-lg border p-4 text-[13px] shadow-(--shadow-card) transition-transform hover:-translate-y-0.5 active:cursor-grabbing " +
                      (dragId === card.id ? "opacity-50" : "")
                    }
                  >
                    <button
                      onClick={() =>
                        router.push(
                          `/contacts?q=${encodeURIComponent(card.email || contactFullName(card))}`,
                        )
                      }
                      className="hover:bg-muted absolute top-2 right-2 z-10 rounded p-1 transition-colors duration-200"
                      aria-label="Voir le contact"
                    >
                      <Eye className="h-4 w-4 stroke-gray-400" aria-hidden="true" />
                    </button>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                        {contactInitial(card)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-sm font-semibold">
                          {contactFullName(card) || card.email}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center text-[11px] text-gray-700">
                      <Mail className="mr-1 h-3 w-3 text-gray-400" aria-hidden="true" />
                      <span className="truncate">{card.email || "—"}</span>
                    </div>
                    <div className="mt-2 w-full border-[0.2px] border-gray-300" />
                    <div className="mt-2 flex items-center text-[11px] text-gray-400">
                      <Calendar className="mr-1 h-3 w-3 text-gray-400" aria-hidden="true" />
                      <span>{relativeTime(card.updatedAt)}</span>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="p-4 text-center text-xs text-gray-400">
                    Aucun contact à cette étape
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
