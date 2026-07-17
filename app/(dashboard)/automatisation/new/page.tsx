"use client";

import { ArrowLeft, UserPlus, Clock, Plus } from "lucide-react";

export default function NewAutomationPage() {
  return (
    <div className="h-full">
      <header className="border-b border-border bg-background px-4 pt-6 pb-5 sm:px-6 lg:px-8 lg:pt-8 lg:pb-6">
        <a
          href="/automatisation"
          className="-ml-2 inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Scénarios
        </a>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Nouvelle automatisation
        </h1>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          Créez un nouveau workflow d&apos;automatisation étape par étape.
        </p>
      </header>

      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <form className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/60 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Flux du workflow
                </p>
                <p className="mt-0.5 text-xs text-blue-700">
                  Visualisez l&apos;enchaînement du déclencheur et des actions.
                  Ajoutez des étapes pour construire votre automatisation.
                </p>
              </div>

              <div className="relative space-y-5 pl-10">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-2 bottom-2 w-0 -translate-x-1/2 border-l-2 border-dashed border-emerald-400/50"
                />

                {/* Carte déclencheur */}
                <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <span
                    aria-hidden="true"
                    className="absolute -left-8 top-[38px] z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center"
                  >
                    <span className="h-3 w-3 rounded-full bg-blue-500 ring-4 ring-blue-100" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1 bg-indigo-500"
                  />
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <UserPlus className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-indigo-600">
                        Déclencheur
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        Nouveau contact créé
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Déclenché à la création d&apos;un contact
                      </p>
                    </div>
                  </div>
                </div>

                {/* Placeholder : aucune action définie */}
                <div className="relative rounded-2xl border-2 border-dashed border-border bg-card p-7 text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Clock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    Aucune action définie
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ajoutez une première action pour démarrer votre séquence.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-card px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Ajouter une action
                </button>
              </div>
            </div>

            {/* Panneau latéral — config du workflow */}
            <aside className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h3 className="text-sm font-bold text-foreground">
                  Paramètres du workflow
                </h3>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Nom du workflow
                    </label>
                    <input
                      type="text"
                      placeholder="Ex. Relance après signature"
                      className="border-border bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      placeholder="À quoi sert cette automatisation ?"
                      className="border-border bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold shadow-(--shadow-card) transition-all duration-200"
              >
                Enregistrer le workflow
              </button>
            </aside>
          </div>
        </form>
      </div>
    </div>
  );
}
