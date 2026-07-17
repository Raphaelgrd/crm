"use client";

import { Palette, Plus } from "lucide-react";

// ⚠️ Simplifié : la vraie page utilise `react-grid-layout` (widgets déplaçables /
// redimensionnables à la souris) + un graphique Recharts ("Évolution des Contacts").
// Reproduire le drag & drop pixel-perfect est un gros chantier à part — ici les 4
// cartes KPI sont fidèles (mêmes libellés, mêmes couleurs), posées en grille CSS
// statique. Si tu veux vraiment le drag & drop plus tard, dis-le moi et on ajoute
// `react-grid-layout` en dépendance.

const KPI_CARDS = [
  {
    label: "Total Contacts",
    value: 0,
    accent: "bg-amber-500",
    note: "vs mois dernier",
    trend: "↑ 0%",
  },
  {
    label: "Nouveaux ce Mois",
    value: 0,
    accent: "bg-emerald-500",
    note: "contacts créés",
  },
  {
    label: "Tâches Complétées",
    value: 0,
    accent: "bg-blue-500",
    note: "sur 0 au total",
  },
  {
    label: "Tâches en Attente",
    value: 0,
    accent: "bg-amber-500",
    note: "à traiter",
  },
];

export default function DashboardPage() {
  return (
    <div className="h-full w-full min-w-0">
      <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Tableau de Bord
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Vue d&apos;ensemble de votre activité
            </p>
          </div>
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <button
                title="Changer la couleur du thème"
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-150 hover:bg-gray-50 hover:shadow-md active:scale-[0.98]"
              >
                <Palette className="h-4 w-4 text-gray-600" aria-hidden="true" />
              </button>
              <button className="dash-btn inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.98]">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter un Widget
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_CARDS.map((card) => (
            <div
              key={card.label}
              className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className={`absolute top-0 left-0 h-1 w-full ${card.accent}`} />
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
                    {card.value}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {card.trend && (
                  <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-600">
                    {card.trend}
                  </span>
                )}
                <span className="text-xs text-gray-400">{card.note}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Placeholder pour le graphique "Évolution des Contacts" (Recharts) */}
        <div className="mt-6 flex h-72 flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-gray-900">
              Évolution des Contacts
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">Contacts créés par mois</p>
          </div>
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Graphique à brancher (recharts + données réelles de la DB)
          </div>
        </div>
      </div>
    </div>
  );
}
