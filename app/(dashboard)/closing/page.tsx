"use client";

import { Settings, Filter, Mail, Calendar, Eye } from "lucide-react";

// ⚠️ Les 7 colonnes et leurs couleurs/compteurs sont fidèles à ta vraie page.
// Les cartes de contact, elles, sont des EXEMPLES génériques — la vraie page
// affichait de vraies coordonnées de prospects (noms, emails), que je n'ai pas
// recopiées ici pour éviter de committer des données personnelles de tiers dans
// un repo Git. Branche un vrai fetch vers ta DB pour remplacer SAMPLE_CARDS.

interface Card {
  id: string;
  initial: string;
  name: string;
  email: string;
  time: string;
}

interface Stage {
  name: string;
  count: number;
  color: string;
  cards: Card[];
}

const STAGES: Stage[] = [
  {
    name: "Nouveau",
    count: 76,
    color: "rgb(59, 130, 246)",
    cards: [
      { id: "1", initial: "J", name: "Jean Dupont", email: "jean.dupont@example.com", time: "Il y a 2 jours" },
      { id: "2", initial: "M", name: "Marie Lambert", email: "marie.lambert@example.com", time: "Il y a 3 jours" },
    ],
  },
  { name: "À rappeler", count: 1, color: "rgb(245, 158, 11)", cards: [] },
  { name: "RDV pris", count: 0, color: "rgb(16, 185, 129)", cards: [] },
  { name: "Pré-qualifié", count: 0, color: "rgb(99, 102, 241)", cards: [] },
  { name: "Converti (contrat signé)", count: 0, color: "rgb(34, 197, 94)", cards: [] },
  { name: "Fermé", count: 0, color: "rgb(107, 114, 128)", cards: [] },
  { name: "Doublon", count: 7, color: "rgb(239, 68, 68)", cards: [] },
];

export default function ClosingPage() {
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
                    <select className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border py-1.5 pr-2 pl-7 text-sm focus:ring-2 focus:outline-none">
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
        {STAGES.map((stage) => (
          <div
            key={stage.name}
            className="bg-muted flex shrink-0 flex-col rounded-xl shadow-sm transition-colors h-auto max-h-[calc(100vh-220px)]"
            style={{ width: 320 }}
          >
            <div
              draggable
              className="flex shrink-0 items-center justify-between rounded-t-xl px-4 py-3 text-sm font-semibold text-white cursor-grab transition-opacity active:cursor-grabbing"
              style={{ backgroundColor: stage.color }}
            >
              <div className="flex items-center gap-2">
                <span>{stage.name}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                  {stage.count}
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {stage.cards.map((card) => (
                <div
                  key={card.id}
                  className="border-border bg-card relative rounded-lg border p-4 text-[13px] shadow-(--shadow-card) transition-transform hover:-translate-y-0.5 cursor-default"
                >
                  <button
                    className="hover:bg-muted absolute top-2 right-2 z-10 rounded p-1 transition-colors duration-200"
                    aria-label="Voir le contact"
                  >
                    <Eye className="h-4 w-4 stroke-gray-400" aria-hidden="true" />
                  </button>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                      {card.initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-sm font-semibold">
                        {card.name}
                      </p>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center text-[11px] text-gray-700">
                    <Mail className="mr-1 h-3 w-3 text-gray-400" aria-hidden="true" />
                    <span className="truncate">{card.email}</span>
                  </div>
                  <div className="mt-2 w-full border-[0.2px] border-gray-300" />
                  <div className="mt-2 flex items-center text-[11px] text-gray-400">
                    <Calendar className="mr-1 h-3 w-3 text-gray-400" aria-hidden="true" />
                    <span>{card.time}</span>
                  </div>
                </div>
              ))}
              {stage.cards.length === 0 && (
                <p className="p-4 text-center text-xs text-gray-400">
                  Aucune carte — branche ta DB ici
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
