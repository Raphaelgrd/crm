"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Globe, ShieldCheck } from "lucide-react";
import { useContacts } from "@/lib/contacts";
import { useOrganizations } from "@/lib/organizations";
import {
  EXPORT_STATUSES,
  ExportStatus,
  contactCountry,
  exportStatusMeta,
  useCompliance,
} from "@/lib/compliance";

const selectClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none";

export default function ConformitePage() {
  const { contacts, loading } = useContacts();
  const { organizations } = useOrganizations();
  const { rules, statusFor, ruleFor, setCountry } = useCompliance();

  // Notes en cours d'édition (par pays) avant enregistrement au blur.
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const countries = useMemo(() => {
    const map = new Map<string, { country: string; count: number }>();
    for (const c of contacts) {
      const co = contactCountry(c);
      if (!co) continue;
      const key = co.toLowerCase();
      const e = map.get(key) ?? { country: co, count: 0 };
      e.count += 1;
      map.set(key, e);
    }
    for (const o of organizations) {
      const co = o.country?.trim();
      if (!co) continue;
      if (!map.has(co.toLowerCase())) map.set(co.toLowerCase(), { country: co, count: 0 });
    }
    // Pays déjà classés mais sans contact.
    for (const r of rules) {
      if (r.country && !map.has(r.id)) map.set(r.id, { country: r.country, count: 0 });
    }
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.country.localeCompare(b.country),
    );
  }, [contacts, organizations, rules]);

  const tally = useMemo(() => {
    const t: Record<ExportStatus, number> = { ok: 0, license: 0, restricted: 0, unknown: 0 };
    for (const c of countries) t[statusFor(c.country)] += 1;
    return t;
  }, [countries, statusFor]);

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="min-w-0">
          <h1 className="text-foreground text-xl font-bold sm:text-2xl">Conformité export</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Classe chaque pays de destination pour piloter l&apos;export du G.I.E
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXPORT_STATUSES.map((s) => (
            <span
              key={s.id}
              className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " + s.badge}
            >
              <span className={"h-2 w-2 rounded-full " + s.dot} />
              {s.label} · {tally[s.id]}
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Avertissement */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Outil de suivi interne, indicatif.</strong> Les statuts sont ceux que tu
            renseignes ici — ils ne constituent pas un avis juridique et ne remplacent pas une
            autorisation d&apos;exportation officielle. Vérifie toujours auprès des autorités
            compétentes avant toute expédition.
          </p>
        </div>

        {loading ? null : countries.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <Globe className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-foreground mt-3 text-sm font-semibold">Aucun pays détecté</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Les pays apparaissent dès que tes contacts ont une valeur « Pays » (colonne importée
              ou fiche).
            </p>
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-(--shadow-card)">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Pays</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Contacts</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Statut export</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => {
                  const status = statusFor(c.country);
                  const meta = exportStatusMeta(status);
                  const savedNotes = ruleFor(c.country)?.notes ?? "";
                  const draft = noteDraft[c.country] ?? savedNotes;
                  return (
                    <tr key={c.country} className="border-border border-t">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className={"h-2.5 w-2.5 rounded-full " + meta.dot} />
                          <span className="text-foreground font-semibold">{c.country}</span>
                        </span>
                      </td>
                      <td className="text-foreground px-4 py-3 whitespace-nowrap">
                        <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
                          {c.count}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <select
                          className={selectClass}
                          value={status}
                          onChange={(e) =>
                            void setCountry(c.country, { status: e.target.value as ExportStatus })
                          }
                        >
                          {EXPORT_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`${selectClass} w-full min-w-48`}
                          value={draft}
                          onChange={(e) =>
                            setNoteDraft((d) => ({ ...d, [c.country]: e.target.value }))
                          }
                          onBlur={() => {
                            if ((noteDraft[c.country] ?? savedNotes) !== savedNotes) {
                              void setCountry(c.country, { notes: noteDraft[c.country] ?? "" });
                            }
                          }}
                          placeholder="Référence licence, dérogation, contexte…"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Le statut d&apos;un pays s&apos;affiche sur les fiches contacts et alerte à la création
          d&apos;un prêt de G.I.E.
        </p>
      </div>
    </div>
  );
}
