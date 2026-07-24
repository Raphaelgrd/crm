"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Clock,
  Filter,
  FileUp,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  Contact,
  Segment,
  STAGES,
  contactFullName,
  contactInitial,
  contactMatchesSegment,
  followUpStatus,
  segmentCount,
  useContacts,
  useSegments,
} from "@/lib/contacts";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ImportCsvModal from "@/components/contacts/ImportCsvModal";
import SendEmailModal from "@/components/contacts/SendEmailModal";
import ContactDetailModal from "@/components/contacts/ContactDetailModal";
import SegmentBuilderModal from "@/components/contacts/SegmentBuilderModal";
import ColumnsPanel from "@/components/contacts/ColumnsPanel";

const selectClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 rounded-lg border px-2 py-1.5 text-sm focus:ring-2 focus:outline-none";

function stageColor(name: string) {
  return STAGES.find((s) => s.name === name)?.color ?? "rgb(107, 114, 128)";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Colonnes de base du tableau ; les colonnes "extra:<clé>" viennent des
// champs personnalisés importés du CSV.
const BASE_COLUMNS = [
  { id: "email", label: "Email" },
  { id: "phone", label: "Téléphone" },
  { id: "company", label: "Société" },
  { id: "category", label: "Catégorie" },
  { id: "stage", label: "Étape" },
  { id: "createdAt", label: "Créé le" },
];
const DEFAULT_COLUMNS = BASE_COLUMNS.map((c) => c.id);
const COLUMNS_KEY = "netforce.contacts.columns";

export default function ContactsPage() {
  const { contacts, loading, addContact, updateContact, deleteContact, importContacts } =
    useContacts();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<Contact | null>(null);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const { segments, saveSegment, deleteSegment } = useSegments();
  const [segMenuOpen, setSegMenuOpen] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [confirmDeleteSeg, setConfirmDeleteSeg] = useState<string | null>(null);
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLUMNS);
  const [relanceOnly, setRelanceOnly] = useState(false);

  // Nombre de relances à traiter (en retard + aujourd'hui) — badge du bouton.
  const relanceDue = useMemo(
    () =>
      contacts.filter((c) => {
        const s = followUpStatus(c);
        return s === "overdue" || s === "today";
      }).length,
    [contacts],
  );

  const activeSegment = useMemo(
    () => segments.find((s) => s.id === activeSegmentId) ?? null,
    [segments, activeSegmentId],
  );

  // Recherche pré-remplie via /contacts?q=… (utilisé par la page Closing)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearch(q);
    try {
      const cols = window.localStorage.getItem(COLUMNS_KEY);
      if (cols) setVisibleCols(JSON.parse(cols) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const saveColumns = (cols: string[]) => {
    setVisibleCols(cols);
    window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols));
  };

  const allExtraKeys = useMemo(
    () =>
      Array.from(new Set(contacts.flatMap((c) => Object.keys(c.extra ?? {}))))
        .sort()
        .slice(0, 40),
    [contacts],
  );

  const categories = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.category).filter(Boolean))).sort(),
    [contacts],
  );

  const allTags = useMemo(
    () => Array.from(new Set(contacts.flatMap((c) => c.tags ?? []))).sort(),
    [contacts],
  );

  // L'ordre affiché EST celui choisi dans le panneau (base et champs importés
  // mélangés librement, réordonnables par glisser-déposer).
  const orderedCols = visibleCols;

  // Toutes les colonnes disponibles pour le panneau : base + champs importés.
  const allColumns = useMemo(
    () => [...BASE_COLUMNS, ...allExtraKeys.map((k) => ({ id: `extra:${k}`, label: k }))],
    [allExtraKeys],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      // Segment actif (constructeur de conditions façon Brevo).
      if (activeSegment && !contactMatchesSegment(c, activeSegment)) return false;
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      // Tags cumulables : le contact doit avoir TOUS les tags cochés.
      if (tagFilters.length > 0 && !tagFilters.every((t) => (c.tags ?? []).includes(t)))
        return false;
      if (!q) return true;
      return [contactFullName(c), c.email, c.phone, c.company, (c.tags ?? []).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [contacts, search, categoryFilter, stageFilter, tagFilters, activeSegment]);

  // Vue « Relances » : ne garde que les contacts avec une relance planifiée,
  // triés du plus en retard au plus lointain.
  const displayed = useMemo(() => {
    if (!relanceOnly) return filtered;
    return filtered
      .filter((c) => followUpStatus(c) !== null)
      .slice()
      .sort((a, b) => (a.nextFollowUpAt ?? "").localeCompare(b.nextFollowUpAt ?? ""));
  }, [filtered, relanceOnly]);

  // window.confirm est bloqué dans certains contextes (aperçu embarqué) :
  // confirmation en deux clics à la place.
  const handleDelete = async (c: Contact) => {
    if (confirmDeleteId !== c.id) {
      setConfirmDeleteId(c.id);
      return;
    }
    setConfirmDeleteId(null);
    await deleteContact(c.id);
  };

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Contacts</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {contacts.length} contact{contacts.length > 1 ? "s" : ""} — gérez votre base,
              importez et filtrez
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="border-border bg-card text-foreground hover:bg-muted focus-visible:ring-primary inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Importer CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="bg-primary text-primary-foreground focus-visible:ring-primary inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau contact
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search
              className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom, email, société…"
              className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium">Catégorie:</span>
            <select
              className={selectClass}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">Toutes</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium">Étape:</span>
            <select
              className={selectClass}
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="all">Toutes</option>
              {STAGES.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {/* Filtre tags cumulables (« Institutionnel » + « Espagne »…) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setTagMenuOpen((o) => !o)}
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors " +
                (tagFilters.length > 0
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-border bg-card text-foreground hover:bg-muted")
              }
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Tags
              {tagFilters.length > 0 && (
                <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                  {tagFilters.length}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {tagMenuOpen && (
              <div className="border-border bg-card absolute top-full left-0 z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border p-2 shadow-lg">
                {allTags.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-3 text-xs">
                    Aucun tag pour le moment — ajoute des tags via la fiche contact ou une colonne
                    « Tags » à l&apos;import CSV.
                  </p>
                ) : (
                  <>
                    {tagFilters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTagFilters([])}
                        className="text-muted-foreground hover:bg-muted mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium"
                      >
                        Effacer la sélection
                      </button>
                    )}
                    {allTags.map((t) => (
                      <label
                        key={t}
                        className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={tagFilters.includes(t)}
                          onChange={(e) =>
                            setTagFilters((list) =>
                              e.target.checked ? [...list, t] : list.filter((x) => x !== t),
                            )
                          }
                        />
                        <span className="text-foreground truncate">{t}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Segments dynamiques façon Brevo */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSegMenuOpen((o) => !o)}
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors " +
                (activeSegment
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:bg-muted")
              }
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              {activeSegment ? activeSegment.name : "Segments"}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {segMenuOpen && (
              <div className="border-border bg-card absolute top-full left-0 z-30 mt-1 w-80 rounded-xl border p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSegment(null);
                    setBuilderOpen(true);
                    setSegMenuOpen(false);
                  }}
                  className="bg-primary text-primary-foreground mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Créer un segment
                </button>
                {activeSegment && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSegmentId(null);
                      setSegMenuOpen(false);
                    }}
                    className="text-muted-foreground hover:bg-muted mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Effacer le segment actif
                  </button>
                )}
                {segments.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-2 text-xs">
                    Aucun segment. Crée un filtre dynamique (ex. « Pays est différent de France ET
                    Catégorie contient Institutionnel ») et enregistre-le sous un nom.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {segments.map((s) => (
                      <div
                        key={s.id}
                        className={
                          "flex items-center gap-1 rounded-lg " +
                          (s.id === activeSegmentId ? "bg-primary/10" : "hover:bg-muted")
                        }
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSegmentId(s.id);
                            setSegMenuOpen(false);
                          }}
                          className="text-foreground min-w-0 flex-1 px-2 py-1.5 text-left text-sm font-medium"
                        >
                          <span className="block truncate">{s.name}</span>
                          <span className="text-muted-foreground block text-[10px]">
                            {segmentCount(contacts, s)} contact
                            {segmentCount(contacts, s) > 1 ? "s" : ""}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSegment(s);
                            setBuilderOpen(true);
                            setSegMenuOpen(false);
                          }}
                          className="hover:bg-card rounded p-1.5"
                          aria-label={`Modifier ${s.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                        </button>
                        {confirmDeleteSeg === s.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              void deleteSegment(s.id);
                              if (activeSegmentId === s.id) setActiveSegmentId(null);
                              setConfirmDeleteSeg(null);
                            }}
                            onBlur={() => setConfirmDeleteSeg(null)}
                            className="rounded bg-red-500 px-2 py-1 text-[10px] font-semibold text-white"
                          >
                            Sûr ?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSeg(s.id)}
                            className="rounded p-1.5 hover:bg-red-50"
                            aria-label={`Supprimer ${s.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vue Relances (suivi des follow-ups) */}
          <button
            type="button"
            onClick={() => setRelanceOnly((o) => !o)}
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors " +
              (relanceOnly
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-border bg-card text-foreground hover:bg-muted")
            }
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Relances
            {relanceDue > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {relanceDue}
              </span>
            )}
          </button>

          {/* Colonnes personnalisables (panneau latéral façon Brevo) */}
          <button
            type="button"
            onClick={() => setColPanelOpen(true)}
            className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            Colonnes
          </button>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {loading ? null : contacts.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-foreground mt-3 text-sm font-semibold">Aucun contact pour le moment</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Crée ton premier contact ou importe un fichier CSV.
            </p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground text-sm">
              {relanceOnly
                ? "Aucune relance planifiée. Ouvre une fiche contact pour en programmer une."
                : "Aucun contact ne correspond aux filtres."}
            </p>
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-(--shadow-card)">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Nom</th>
                  {orderedCols.map((id) => (
                    <th key={id} className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">
                      {id.startsWith("extra:")
                        ? id.slice(6)
                        : BASE_COLUMNS.find((c) => c.id === id)?.label ?? id}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setDetailContact(c)}
                    className="border-border hover:bg-muted/50 cursor-pointer border-t transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {contactInitial(c)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-foreground block font-semibold whitespace-nowrap">
                            {contactFullName(c) || "—"}
                          </span>
                          {c.nextFollowUpAt &&
                            (() => {
                              const s = followUpStatus(c);
                              const cls =
                                s === "overdue"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : s === "today"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700";
                              return (
                                <span
                                  className={
                                    "mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium " +
                                    cls
                                  }
                                >
                                  <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                                  Relance {formatDate(c.nextFollowUpAt)}
                                </span>
                              );
                            })()}
                          {(c.tags ?? []).length > 0 && (
                            <span className="mt-0.5 flex flex-wrap gap-1">
                              {(c.tags ?? []).slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-px text-[10px] font-medium text-blue-700"
                                >
                                  {t}
                                </span>
                              ))}
                              {(c.tags ?? []).length > 3 && (
                                <span className="text-muted-foreground text-[10px]">
                                  +{(c.tags ?? []).length - 3}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {orderedCols.map((id) => (
                      <td key={id} className="text-foreground px-4 py-3 whitespace-nowrap">
                        {id === "email" && (c.email || "—")}
                        {id === "phone" && (c.phone || "—")}
                        {id === "company" && (c.company || "—")}
                        {id === "category" &&
                          (c.category ? (
                            <span className="bg-muted text-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                              {c.category}
                            </span>
                          ) : (
                            "—"
                          ))}
                        {id === "stage" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: stageColor(c.stage) }}
                            />
                            {c.stage}
                          </span>
                        )}
                        {id === "createdAt" && (
                          <span className="text-muted-foreground text-xs">{formatDate(c.createdAt)}</span>
                        )}
                        {id.startsWith("extra:") && (
                          <span className="block max-w-48 truncate" title={c.extra?.[id.slice(6)] ?? ""}>
                            {c.extra?.[id.slice(6)] || "—"}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSendingTo(c)}
                          disabled={!c.email}
                          className="hover:bg-muted rounded p-1.5 transition-colors disabled:opacity-30"
                          aria-label="Envoyer le mail nouveaux arrivants"
                          title={
                            c.lastEmailSentAt
                              ? `Mail envoyé le ${formatDate(c.lastEmailSentAt)}`
                              : "Envoyer le mail nouveaux arrivants"
                          }
                        >
                          <Send
                            className={
                              "h-4 w-4 " +
                              (c.lastEmailSentAt ? "text-green-500" : "text-gray-400")
                            }
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                          className="hover:bg-muted rounded p-1.5 transition-colors"
                          aria-label="Modifier"
                        >
                          <Pencil className="h-4 w-4 text-gray-400" aria-hidden="true" />
                        </button>
                        {confirmDeleteId === c.id ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete(c)}
                            onBlur={() => setConfirmDeleteId(null)}
                            className="rounded bg-red-500 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                          >
                            Confirmer ?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleDelete(c)}
                            className="rounded p-1.5 transition-colors hover:bg-red-50"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ContactFormModal
        open={formOpen}
        initial={editing}
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSave={async (input) => {
          if (editing) {
            await updateContact(editing.id, input);
          } else {
            await addContact(input);
          }
        }}
      />
      <ImportCsvModal
        open={importOpen}
        existingAttributes={allExtraKeys}
        onClose={() => setImportOpen(false)}
        onImport={importContacts}
      />
      <ContactDetailModal
        contact={detailContact}
        onClose={() => setDetailContact(null)}
        onEdit={(c) => {
          setDetailContact(null);
          setEditing(c);
          setFormOpen(true);
        }}
        onSendEmail={(c) => {
          setDetailContact(null);
          setSendingTo(c);
        }}
        onSetFollowUp={async (c, date) => {
          await updateContact(c.id, { nextFollowUpAt: date ?? "" });
          setDetailContact((cur) => (cur ? { ...cur, nextFollowUpAt: date ?? "" } : cur));
        }}
      />
      <SendEmailModal
        open={sendingTo !== null}
        contact={sendingTo}
        onClose={() => setSendingTo(null)}
        onSent={async (c) => {
          const sentAt = new Date().toISOString();
          await updateContact(c.id, { lastEmailSentAt: sentAt });
          setSendingTo((cur) => (cur ? { ...cur, lastEmailSentAt: sentAt } : cur));
        }}
      />
      <SegmentBuilderModal
        open={builderOpen}
        initial={editingSegment}
        contacts={contacts}
        onClose={() => setBuilderOpen(false)}
        onSave={async (input) => {
          const saved = await saveSegment(input);
          setActiveSegmentId(saved.id);
        }}
      />
      <ColumnsPanel
        open={colPanelOpen}
        allColumns={allColumns}
        initial={visibleCols}
        onClose={() => setColPanelOpen(false)}
        onSave={saveColumns}
      />
    </div>
  );
}
