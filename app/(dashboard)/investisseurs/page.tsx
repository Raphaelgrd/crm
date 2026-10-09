"use client";

import { useMemo, useState } from "react";
import { useContacts, STAGES, contactFullName, contactInitial, StageName } from "@/lib/contacts";
import { TrendingUp, Euro } from "lucide-react";

function formatEur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function parseInvest(c: { extra?: Record<string, string> }): number {
  const raw = c.extra?.["Investissement"] ?? "";
  const val = parseInt(raw.replace(/[\s ]/g, ""), 10);
  return isNaN(val) ? 0 : val;
}

const PIPELINE_STAGES: StageName[] = [
  "Nouveau",
  "À rappeler",
  "RDV pris",
  "Pré-qualifié",
  "Converti (contrat signé)",
];

export default function InvestisseursPage() {
  const { contacts, loading, updateContact } = useContacts();
  const [dragging, setDragging] = useState<string | null>(null);

  const investors = useMemo(
    () => contacts.filter((c) => c.category === "Investisseur"),
    [contacts],
  );

  const totalInvest = useMemo(
    () => investors.reduce((sum, c) => sum + parseInvest(c), 0),
    [investors],
  );

  const byStage = useMemo(() => {
    const map = new Map<StageName, typeof investors>();
    for (const s of PIPELINE_STAGES) map.set(s, []);
    for (const c of investors) {
      const stage = PIPELINE_STAGES.includes(c.stage as StageName) ? c.stage as StageName : "Nouveau";
      map.get(stage)?.push(c);
    }
    return map;
  }, [investors]);

  const stageTotal = (stage: StageName) =>
    (byStage.get(stage) ?? []).reduce((sum, c) => sum + parseInvest(c), 0);

  const handleDrop = async (stage: StageName, contactId: string) => {
    await updateContact(contactId, { stage });
    setDragging(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Pipeline investisseurs</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {investors.length} investisseur{investors.length > 1 ? "s" : ""} · {formatEur(totalInvest)} d&apos;intentions
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Total levée</p>
              <p className="text-lg font-bold text-amber-900 dark:text-amber-100">{loading ? "…" : formatEur(totalInvest)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full min-w-max gap-4 p-4 sm:p-6">
          {PIPELINE_STAGES.map((stage) => {
            const stageInfo = STAGES.find((s) => s.name === stage);
            const cards = byStage.get(stage) ?? [];
            const stageSum = stageTotal(stage);

            return (
              <div
                key={stage}
                className="border-border bg-muted/30 flex w-72 shrink-0 flex-col rounded-2xl border"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragging && void handleDrop(stage, dragging)}
              >
                {/* Column header */}
                <div className="border-border border-b px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: stageInfo?.color }}
                      />
                      <span className="text-foreground text-sm font-semibold">{stage}</span>
                      <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                        {cards.length}
                      </span>
                    </div>
                  </div>
                  {stageSum > 0 && (
                    <p className="text-muted-foreground mt-1 text-xs font-medium">
                      {formatEur(stageSum)}
                    </p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {cards.length === 0 && (
                    <div className="border-border rounded-xl border border-dashed py-8 text-center">
                      <p className="text-muted-foreground text-xs">Aucun investisseur</p>
                    </div>
                  )}
                  {cards.map((c) => {
                    const amount = parseInvest(c);
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDragging(c.id)}
                        onDragEnd={() => setDragging(null)}
                        className={`bg-card border-border cursor-grab rounded-xl border p-3 shadow-sm transition-shadow active:cursor-grabbing active:shadow-md ${dragging === c.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                            {contactInitial(c)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground text-sm font-semibold leading-tight">
                              {contactFullName(c) || "—"}
                            </p>
                            {c.email && (
                              <p className="text-muted-foreground truncate text-xs">{c.email}</p>
                            )}
                          </div>
                        </div>
                        {amount > 0 && (
                          <div className="mt-2 flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 dark:bg-amber-950/30">
                            <Euro className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                              {formatEur(amount)}
                            </span>
                          </div>
                        )}
                        {c.extra?.["Origine"] && (
                          <p className="text-muted-foreground mt-1.5 text-[10px]">
                            via {c.extra["Origine"]}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
