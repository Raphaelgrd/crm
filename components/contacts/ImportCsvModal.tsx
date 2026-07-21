"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Upload, X } from "lucide-react";
import { ContactInput, DEFAULT_CATEGORIES, STAGES, StageName } from "@/lib/contacts";
import { ParsedCsv, parseCsv } from "@/lib/csv";

interface Props {
  open: boolean;
  /** Attributs personnalisés déjà présents (pour rediriger une colonne dessus). */
  existingAttributes: string[];
  onClose: () => void;
  onImport: (
    inputs: ContactInput[],
    options: { updateExisting?: boolean },
  ) => Promise<{ added: number; updated: number; skipped: number }>;
}

type Field =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "company"
  | "category"
  | "tags"
  | "notes";

const FIELD_LABELS: Record<Field, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  email: "Email",
  phone: "Téléphone",
  company: "Société",
  category: "Catégorie",
  tags: "Tags",
  notes: "Notes",
};
const FIELDS = Object.keys(FIELD_LABELS) as Field[];

// Auto-détection des colonnes usuelles (exports FR et EN).
const AUTO_MATCH: Record<Field, RegExp> = {
  firstName: /^(pr[ée]nom|first ?name|prenom)$/i,
  lastName: /^(nom( de famille)?|last ?name|surname)$/i,
  email: /^(e-?mail|courriel|mail)$/i,
  phone: /^(t[ée]l[ée]phone|tel|phone|mobile|portable)$/i,
  company: /^(soci[ée]t[ée]|entreprise|company|organisation)$/i,
  category: /^(cat[ée]gorie|category|type)$/i,
  tags: /^(tags?|listes?|segments?)$/i,
  notes: /^(notes?|commentaires?)$/i,
};

// Destination d'une colonne CSV : ignorée, champ standard, ou attribut
// (existant ou nouveau — les deux finissent dans contact.extra[name]).
type Dest =
  | { kind: "ignore" }
  | { kind: "field"; field: Field }
  | { kind: "attr"; name: string; isNew: boolean };

const selectClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none";

export default function ImportCsvModal({ open, existingAttributes, onClose, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [dest, setDest] = useState<Dest[]>([]);
  const [defaultStage, setDefaultStage] = useState<StageName>("Nouveau");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(
    null,
  );
  const [error, setError] = useState("");

  const reset = () => {
    setFileName("");
    setCsv(null);
    setDest([]);
    setResult(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError("");
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setError(
        "Fichier vide ou illisible. Vérifie qu'il s'agit bien d'un CSV avec une ligne d'en-têtes.",
      );
      return;
    }
    // Auto-détection : d'abord les champs standard, sinon un attribut (existant
    // si l'en-tête correspond à un attribut connu, sinon un nouvel attribut).
    const usedFields = new Set<Field>();
    const dests: Dest[] = parsed.headers.map((header) => {
      const h = header.trim();
      if (!h) return { kind: "ignore" };
      for (const field of FIELDS) {
        if (!usedFields.has(field) && AUTO_MATCH[field].test(h)) {
          usedFields.add(field);
          return { kind: "field", field };
        }
      }
      const match = existingAttributes.find((a) => a.toLowerCase() === h.toLowerCase());
      return match
        ? { kind: "attr", name: match, isNew: false }
        : { kind: "attr", name: h, isNew: true };
    });
    setFileName(file.name);
    setCsv(parsed);
    setDest(dests);
  };

  const selectValue = (d: Dest): string => {
    if (d.kind === "ignore") return "ignore";
    if (d.kind === "field") return `field:${d.field}`;
    return d.isNew ? "new" : `attr:${d.name}`;
  };

  const setColumn = (i: number, value: string, header: string) => {
    setDest((cur) => {
      const next = [...cur];
      let d: Dest;
      if (value === "ignore") d = { kind: "ignore" };
      else if (value === "new") d = { kind: "attr", name: header.trim() || `Colonne ${i + 1}`, isNew: true };
      else if (value.startsWith("field:")) d = { kind: "field", field: value.slice(6) as Field };
      else d = { kind: "attr", name: value.slice(5), isNew: false };
      // Un champ standard ne peut être associé qu'à une seule colonne.
      if (d.kind === "field") {
        for (let j = 0; j < next.length; j++) {
          if (j !== i && next[j].kind === "field" && (next[j] as { field: Field }).field === d.field) {
            next[j] = { kind: "ignore" };
          }
        }
      }
      next[i] = d;
      return next;
    });
  };

  const renameAttr = (i: number, name: string) =>
    setDest((cur) => cur.map((d, j) => (j === i && d.kind === "attr" ? { ...d, name } : d)));

  // Résumé des attributs qui seront créés / alimentés.
  const attrSummary = useMemo(() => {
    const created: string[] = [];
    const filled: string[] = [];
    for (const d of dest) {
      if (d.kind !== "attr" || !d.name.trim()) continue;
      (d.isNew ? created : filled).push(d.name.trim());
    }
    return { created: Array.from(new Set(created)), filled: Array.from(new Set(filled)) };
  }, [dest]);

  const handleImport = async () => {
    if (!csv) return;
    const hasIdentity = dest.some(
      (d) => d.kind === "field" && (d.field === "email" || d.field === "lastName" || d.field === "firstName"),
    );
    if (!hasIdentity) {
      setError("Associe au moins une colonne à Email, Nom ou Prénom pour pouvoir importer.");
      return;
    }
    setError("");
    setImporting(true);
    try {
      const inputs: ContactInput[] = csv.rows
        .map((row) => {
          const base = {
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            company: "",
            category: "",
            notes: "",
          };
          let tags: string[] = [];
          const extra: Record<string, string> = {};
          dest.forEach((d, i) => {
            const value = (row[i] ?? "").trim();
            if (!value) return;
            if (d.kind === "field") {
              if (d.field === "tags") {
                tags = value.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
              } else {
                base[d.field] = value;
              }
            } else if (d.kind === "attr" && d.name.trim()) {
              extra[d.name.trim()] = value;
            }
          });
          return {
            ...base,
            category: base.category || DEFAULT_CATEGORIES[0],
            stage: defaultStage,
            tags,
            extra,
          };
        })
        .filter((c) => c.firstName || c.lastName || c.email);
      setResult(await onImport(inputs, { updateExisting }));
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">Importer des contacts (CSV)</h2>
          <button
            type="button"
            onClick={close}
            className="hover:bg-muted rounded p-1 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {result ? (
            <div className="py-6 text-center">
              <p className="text-foreground text-base font-semibold">
                ✅ {result.added} contact{result.added > 1 ? "s" : ""} créé{result.added > 1 ? "s" : ""}
              </p>
              {result.updated > 0 && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {result.updated} fiche{result.updated > 1 ? "s" : ""} existante
                  {result.updated > 1 ? "s" : ""} complétée{result.updated > 1 ? "s" : ""} (même email)
                </p>
              )}
              {result.skipped > 0 && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {result.skipped} doublon{result.skipped > 1 ? "s" : ""} ignoré
                  {result.skipped > 1 ? "s" : ""} (email déjà présent)
                </p>
              )}
            </div>
          ) : (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="border-border hover:bg-muted flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm font-medium text-gray-600 transition-colors"
              >
                <FileUp className="h-5 w-5 text-gray-400" aria-hidden="true" />
                {fileName || "Choisir un fichier CSV (séparateur , ou ;)"}
              </button>

              {csv && (
                <>
                  <div>
                    <h3 className="text-foreground text-sm font-semibold">
                      Associer chaque colonne du fichier
                    </h3>
                    <p className="text-muted-foreground mb-3 text-xs">
                      Pour chaque colonne : un champ standard, un attribut existant (si
                      l&apos;orthographe diffère), ou crée un nouvel attribut.
                    </p>
                    <div className="border-border divide-border max-h-72 divide-y overflow-y-auto rounded-lg border">
                      {csv.headers.map((h, i) => {
                        const d = dest[i] ?? { kind: "ignore" as const };
                        const sample = (csv.rows[0]?.[i] ?? "").trim();
                        return (
                          <div key={i} className="flex items-center gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-foreground truncate text-sm font-medium">
                                {h || `Colonne ${i + 1}`}
                              </p>
                              {sample && (
                                <p className="text-muted-foreground truncate text-[11px]">
                                  ex : {sample}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <select
                                className={`${selectClass} w-44`}
                                value={selectValue(d)}
                                onChange={(e) => setColumn(i, e.target.value, h)}
                              >
                                <option value="ignore">— Ignorer —</option>
                                <optgroup label="Champ standard">
                                  {FIELDS.map((f) => (
                                    <option key={f} value={`field:${f}`}>
                                      {FIELD_LABELS[f]}
                                    </option>
                                  ))}
                                </optgroup>
                                {existingAttributes.length > 0 && (
                                  <optgroup label="Attribut existant">
                                    {existingAttributes.map((a) => (
                                      <option key={a} value={`attr:${a}`}>
                                        {a}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="Nouveau">
                                  <option value="new">➕ Nouvel attribut…</option>
                                </optgroup>
                              </select>
                              {d.kind === "attr" && d.isNew && (
                                <input
                                  value={d.name}
                                  onChange={(e) => renameAttr(i, e.target.value)}
                                  placeholder="Nom de l'attribut"
                                  className={`${selectClass} w-36`}
                                  aria-label="Nom du nouvel attribut"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {(attrSummary.created.length > 0 || attrSummary.filled.length > 0) && (
                    <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      {attrSummary.created.length > 0 && (
                        <p>
                          <span className="font-semibold">Nouveaux attributs créés :</span>{" "}
                          {attrSummary.created.join(", ")}
                        </p>
                      )}
                      {attrSummary.filled.length > 0 && (
                        <p className={attrSummary.created.length > 0 ? "mt-0.5" : ""}>
                          <span className="font-semibold">Attributs existants alimentés :</span>{" "}
                          {attrSummary.filled.join(", ")}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={updateExisting}
                        onChange={(e) => setUpdateExisting(e.target.checked)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span className="text-foreground">
                        Compléter les fiches existantes (même email){" "}
                        <span className="text-muted-foreground text-xs">
                          (sinon les doublons sont ignorés)
                        </span>
                      </span>
                    </label>
                    <div className="sm:ml-auto">
                      <label className="text-muted-foreground mr-2 text-xs font-medium">
                        Étape (tous)
                      </label>
                      <select
                        className={selectClass}
                        value={defaultStage}
                        onChange={(e) => setDefaultStage(e.target.value as StageName)}
                      >
                        {STAGES.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        <div className="border-border flex justify-end gap-3 border-t px-6 py-4">
          {result ? (
            <button
              type="button"
              onClick={close}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={close}
                className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!csv || importing}
                className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {importing ? "Import en cours…" : "Importer"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
