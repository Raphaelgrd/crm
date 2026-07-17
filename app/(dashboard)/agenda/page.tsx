"use client";

import { Video, Calendar, Bookmark } from "lucide-react";

// ⚠️ Simplifié : la vraie page affiche une grille de calendrier complète
// (vue semaine avec créneaux horaires, probablement FullCalendar ou équivalent).
// L'en-tête (date, titre, boutons Google Meet / Rendez-vous / Tâche) est fidèle.
// La grille horaire elle-même est un placeholder — envoie-moi un export avec
// plus de la grille visible si tu veux que je la reconstruise en détail.

export default function AgendaPage() {
  const today = new Date();

  return (
    <div className="bg-crms-bg flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex flex-col items-center">
                <div className="text-2xl font-bold text-gray-900 sm:text-3xl">
                  {today.getDate()}
                </div>
                <div className="text-[10px] font-medium text-gray-500 uppercase sm:text-xs">
                  {today.toLocaleDateString("fr-FR", { month: "short" })}
                </div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Agenda
                </h1>
                <p className="text-xs text-gray-500 sm:text-sm">
                  {today.toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
              >
                <Video className="h-4 w-4" aria-hidden="true" />
                Google Meet
              </button>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Calendar className="h-4 w-4" aria-hidden="true" />
                Rendez-vous
              </button>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                Tâche
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 sm:hidden">
            <button
              type="button"
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              <Video className="h-3.5 w-3.5" aria-hidden="true" />
              Meet
            </button>
            <button
              type="button"
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              RDV
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        Grille de calendrier (vue semaine) à brancher — envoie un export plus
        complet de cette page pour la reconstruction détaillée.
      </div>
    </div>
  );
}
