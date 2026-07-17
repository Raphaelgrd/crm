"use client";

import { useRef, useState } from "react";
import { FileUp, Upload, X } from "lucide-react";
import { ContactInput, DEFAULT_CATEGORIES, STAGES, StageName } from "@/lib/contacts";
import { ParsedCsv, parseCsv } from "@/lib/csv";

interface Props {
  open: boolean;
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

const selectClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none";

export default function ImportCsvModal({ open, onClose, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<Field, number>>>({});
  const [defaultStage, setDefaultStage] = useState<StageName>("Nouveau");
  const [keepExtra, setKeepExtra] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(
    null,
  );
  const [error, setError] = useState("");

  if (!open) return null;

  const reset = () => {
    setFileName("");
    setCsv(null);
    setMapping({});
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
      setError("Fichier vide ou illisible. Vérifie qu'il s'agit bien d'un CSV avec une ligne d'en-têtes.");
      return;
    }
    const auto: Partial<Record<Field, number>> = {};
    parsed.headers.forEach((header, index) => {
      (Object.keys(AUTO_MATCH) as Field[]).forEach((field) => {
        if (auto[field] === undefined && AUTO_MATCH[field].test(header.trim())) {
          auto[field] = index;
        }
      });
    });
    setFileName(file.name);
    setCsv(parsed);
    setMapping(auto);
  };

  const handleImport = async () => {
    if (!csv) return;
    if (mapping.email === undefined && mapping.lastName === undefined && mapping.firstName === undefined) {
      setError("Associe au moins la colonne Email ou Nom pour pouvoir importer.");
      return;
    }
    setError("");
    setImporting(true);
    try {
      const get = (row: string[], field: Field) => {
        const idx = mapping[field];
        return idx === undefined ? "" : (row[idx] ?? "").trim();
      };
      const mappedIndexes = new Set(Object.values(mapping).filter((v) => v !== undefined));
      const inputs: ContactInput[] = csv.rows
        .map((row) => {
          // Colonnes non associées : conservées telles quelles sur la fiche.
          const extra: Record<string, string> = {};
          if (keepExtra) {
            csv.headers.forEach((header, i) => {
              const value = (row[i] ?? "").trim();
              if (!mappedIndexes.has(i) && header.trim() && value) {
                extra[header.trim()] = value;
              }
            });
          }
          return {
            firstName: get(row, "firstName"),
            lastName: get(row, "lastName"),
            email: get(row, "email"),
            phone: get(row, "phone"),
            company: get(row, "company"),
            category: get(row, "category") || DEFAULT_CATEGORIES[0],
            stage: defaultStage,
            notes: get(row, "notes"),
            tags: get(row, "tags")
              .split(/[;,]/)
              .map((t) => t.trim())
              .filter(Boolean),
            extra,
          };
        })
        .filter((c) => c.firstName || c.lastName || c.email);
      setResult(await onImport(inputs, { updateExisting }));
    } finally {
      setImporting(false);
    }
  };

  const preview = csv?.rows.slice(0, 5) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        className="bg-card flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">Importer des contacts (CSV)</h2>
          <button type="button" onClick={close} className="hover:bg-muted rounded p-1 transition-colors" aria-label="Fermer">
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
                  {result.updated} fiche{result.updated > 1 ? "s" : ""} existante{result.updated > 1 ? "s" : ""} complétée{result.updated > 1 ? "s" : ""} (même email)
                </p>
              )}
              {result.skipped > 0 && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {result.skipped} doublon{result.skipped > 1 ? "s" : ""} ignoré{result.skipped > 1 ? "s" : ""} (email déjà présent)
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
                    <h3 className="text-foreground mb-2 text-sm font-semibold">
                      Correspondance des colonnes
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {(Object.keys(FIELD_LABELS) as Field[]).map((field) => (
                        <div key={field}>
                          <label className="text-muted-foreground mb-1 block text-xs font-medium">
                            {FIELD_LABELS[field]}
                          </label>
                          <select
                            className={`${selectClass} w-full`}
                            value={mapping[field] ?? ""}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [field]: e.target.value === "" ? undefined : Number(e.target.value),
                              }))
                            }
                          >
                            <option value="">— Ignorer —</option>
                            {csv.headers.map((h, i) => (
                              <option key={i} value={i}>
                                {h || `Colonne ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      <div>
                        <label className="text-muted-foreground mb-1 block text-xs font-medium">
                          Étape pipeline (tous)
                        </label>
                        <select
                          className={`${selectClass} w-full`}
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
                  </div>

                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={keepExtra}
                        onChange={(e) => setKeepExtra(e.target.checked)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span className="text-foreground">
                        Conserver toutes les autres colonnes sur la fiche client{" "}
                        <span className="text-muted-foreground text-xs">
                          (rien n&apos;est perdu, visible en ouvrant la fiche)
                        </span>
                      </span>
                    </label>
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
                  </div>

                  <div>
                    <h3 className="text-foreground mb-2 text-sm font-semibold">
                      Aperçu ({csv.rows.length} ligne{csv.rows.length > 1 ? "s" : ""})
                    </h3>
                    <div className="border-border overflow-x-auto rounded-lg border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted">
                          <tr>
                            {csv.headers.map((h, i) => (
                              <th key={i} className="text-muted-foreground px-3 py-2 font-medium whitespace-nowrap">
                                {h || `Colonne ${i + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, ri) => (
                            <tr key={ri} className="border-border border-t">
                              {csv.headers.map((_, ci) => (
                                <td key={ci} className="text-foreground px-3 py-2 whitespace-nowrap">
                                  {row[ci] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
