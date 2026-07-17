"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRightLeft,
  Bookmark,
  Clock,
  Mail,
  Plus,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Action, TriggerType, useAutomations } from "@/lib/automations";
import { DEFAULT_CATEGORIES, STAGES, StageName } from "@/lib/contacts";
import { useTemplates } from "@/lib/templates";

const inputClass =
  "border-border bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40";
const smallSelect =
  "border-border bg-background rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/40";

interface ActionItem {
  key: string;
  action: Action;
}

const ACTION_META: Record<Action["type"], { label: string; icon: typeof Mail }> = {
  send_email: { label: "Envoyer un email", icon: Mail },
  create_task: { label: "Créer une tâche", icon: Bookmark },
  set_stage: { label: "Changer l'étape", icon: ArrowRightLeft },
  set_category: { label: "Changer la catégorie", icon: Tag },
};

function makeKey() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultAction(type: Action["type"], firstTemplateId: string): Action {
  switch (type) {
    case "send_email":
      return { type, templateId: firstTemplateId };
    case "create_task":
      return { type, title: "Rappeler le contact", dueInDays: 1 };
    case "set_stage":
      return { type, stage: "À rappeler" };
    case "set_category":
      return { type, category: DEFAULT_CATEGORIES[0] };
  }
}

export default function NewAutomationPage() {
  const router = useRouter();
  const { getAutomation, addAutomation, updateAutomation } = useAutomations();
  const { templates } = useTemplates();
  const emailTemplates = templates.filter((t) => t.type === "Email");

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [triggerType, setTriggerType] = useState<TriggerType>("contact_created");
  const [triggerStage, setTriggerStage] = useState<StageName | "">("");
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");

  // Mode édition : /automatisation/new?id=…
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    void getAutomation(id).then((a) => {
      if (!a) return;
      setEditId(a.id);
      setName(a.name);
      setDescription(a.description);
      setActive(a.active);
      setTriggerType(a.trigger.type);
      setTriggerStage(a.trigger.stage);
      setActions(a.actions.map((action) => ({ key: makeKey(), action })));
    });
  }, [getAutomation]);

  const patchAction = (key: string, patch: Partial<Action>) => {
    setActions((list) =>
      list.map((item) =>
        item.key === key ? { ...item, action: { ...item.action, ...patch } as Action } : item,
      ),
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Donne un nom au workflow.");
      return;
    }
    if (actions.length === 0) {
      setError("Ajoute au moins une action.");
      return;
    }
    setError("");
    const input = {
      name: name.trim(),
      description: description.trim(),
      active,
      trigger: { type: triggerType, stage: triggerType === "stage_changed" ? triggerStage : "" as const },
      actions: actions.map((a) => a.action),
    };
    if (editId) await updateAutomation(editId, input);
    else await addAutomation(input);
    router.push("/automatisation");
  };

  const TriggerIcon = triggerType === "contact_created" ? UserPlus : ArrowRightLeft;

  return (
    <div className="h-full">
      <header className="border-b border-border bg-background px-4 pt-6 pb-5 sm:px-6 lg:px-8 lg:pt-8 lg:pb-6">
        <Link
          href="/automatisation"
          className="-ml-2 inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Scénarios
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {editId ? "Modifier l'automatisation" : "Nouvelle automatisation"}
        </h1>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          Créez un nouveau workflow d&apos;automatisation étape par étape.
        </p>
      </header>

      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <form className="space-y-6" onSubmit={handleSave}>
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
                      <TriggerIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-indigo-600">
                        Déclencheur
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <select
                          className={smallSelect}
                          value={triggerType}
                          onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                        >
                          <option value="contact_created">Nouveau contact créé</option>
                          <option value="stage_changed">Contact change d&apos;étape</option>
                        </select>
                        {triggerType === "stage_changed" && (
                          <>
                            <span className="text-muted-foreground text-xs">vers</span>
                            <select
                              className={smallSelect}
                              value={triggerStage}
                              onChange={(e) => setTriggerStage(e.target.value as StageName | "")}
                            >
                              <option value="">N&apos;importe quelle étape</option>
                              {STAGES.map((s) => (
                                <option key={s.name} value={s.name}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {triggerType === "contact_created"
                          ? "Déclenché à la création d'un contact (manuelle ou import CSV)"
                          : "Déclenché quand un contact est déplacé dans le pipeline"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {actions.length === 0 ? (
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
                ) : (
                  actions.map(({ key, action }, index) => {
                    const meta = ACTION_META[action.type];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={key}
                        className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute -left-8 top-[38px] z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center"
                        >
                          <span className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
                        </span>
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-1 bg-emerald-500"
                        />
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-600">
                              Action {index + 1}
                            </p>
                            <p className="text-sm font-semibold text-foreground">{meta.label}</p>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {action.type === "send_email" && (
                                <>
                                  <select
                                    className={smallSelect}
                                    value={action.templateId}
                                    onChange={(e) => patchAction(key, { templateId: e.target.value })}
                                  >
                                    {emailTemplates.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                        {t.special === "welcome" ? " (mail fiches client)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="text-muted-foreground text-xs">
                                    → file d&apos;attente, envoi direct après branchement Google
                                  </span>
                                </>
                              )}
                              {action.type === "create_task" && (
                                <>
                                  <input
                                    className={`${smallSelect} w-56`}
                                    value={action.title}
                                    onChange={(e) => patchAction(key, { title: e.target.value })}
                                    placeholder="Titre de la tâche"
                                  />
                                  <span className="text-muted-foreground text-xs">dans</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={365}
                                    className={`${smallSelect} w-20`}
                                    value={action.dueInDays}
                                    onChange={(e) =>
                                      patchAction(key, { dueInDays: Number(e.target.value) || 0 })
                                    }
                                  />
                                  <span className="text-muted-foreground text-xs">jour(s)</span>
                                </>
                              )}
                              {action.type === "set_stage" && (
                                <select
                                  className={smallSelect}
                                  value={action.stage}
                                  onChange={(e) =>
                                    patchAction(key, { stage: e.target.value as StageName })
                                  }
                                >
                                  {STAGES.map((s) => (
                                    <option key={s.name} value={s.name}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {action.type === "set_category" && (
                                <input
                                  className={`${smallSelect} w-48`}
                                  list="automation-categories"
                                  value={action.category}
                                  onChange={(e) => patchAction(key, { category: e.target.value })}
                                />
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActions((l) => l.filter((a) => a.key !== key))}
                            className="rounded p-1.5 transition-colors hover:bg-red-50"
                            aria-label="Supprimer l'action"
                          >
                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <datalist id="automation-categories">
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>

              <div className="relative flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-card px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50"
                >
                  {menuOpen ? (
                    <X className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  Ajouter une action
                </button>
                {menuOpen && (
                  <div className="border-border bg-card absolute top-full z-20 mt-2 w-64 rounded-xl border p-2 shadow-lg">
                    {(Object.keys(ACTION_META) as Action["type"][]).map((type) => {
                      const meta = ACTION_META[type];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setActions((l) => [
                              ...l,
                              { key: makeKey(), action: defaultAction(type, emailTemplates[0]?.id ?? "") },
                            ]);
                            setMenuOpen(false);
                          }}
                          className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors"
                        >
                          <Icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                )}
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
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex. Relance après signature"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="À quoi sert cette automatisation ?"
                      className={inputClass}
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="text-foreground font-medium">Automatisation active</span>
                  </label>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold shadow-(--shadow-card) transition-all duration-200"
              >
                {editId ? "Enregistrer les modifications" : "Enregistrer le workflow"}
              </button>
            </aside>
          </div>
        </form>
      </div>
    </div>
  );
}
