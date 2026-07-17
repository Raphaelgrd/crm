"use client";

import { useMemo, useState } from "react";
import { FileUp, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import {
  Contact,
  STAGES,
  contactFullName,
  contactInitial,
  useContacts,
} from "@/lib/contacts";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ImportCsvModal from "@/components/contacts/ImportCsvModal";

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

  const categories = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.category).filter(Boolean))).sort(),
    [contacts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (!q) return true;
      return [contactFullName(c), c.email, c.phone, c.company]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [contacts, search, categoryFilter, stageFilter]);

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
        ) : filtered.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground text-sm">Aucun contact ne correspond aux filtres.</p>
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-(--shadow-card)">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Nom</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Email</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Téléphone</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Société</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Catégorie</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Étape</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Créé le</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-border hover:bg-muted/50 border-t transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {contactInitial(c)}
                        </div>
                        <span className="text-foreground font-semibold whitespace-nowrap">
                          {contactFullName(c) || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="text-foreground px-4 py-3 whitespace-nowrap">{c.email || "—"}</td>
                    <td className="text-foreground px-4 py-3 whitespace-nowrap">{c.phone || "—"}</td>
                    <td className="text-foreground px-4 py-3 whitespace-nowrap">{c.company || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.category ? (
                        <span className="bg-muted text-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                          {c.category}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: stageColor(c.stage) }}
                        />
                        {c.stage}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex justify-end gap-1">
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
        onClose={() => setImportOpen(false)}
        onImport={importContacts}
      />
    </div>
  );
}
