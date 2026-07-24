"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { STAGES, contactFullName, useContacts } from "@/lib/contacts";
import {
  Account,
  Organization,
  buildAccounts,
  useOrganizations,
} from "@/lib/organizations";
import OrganizationFormModal from "@/components/organizations/OrganizationFormModal";

function stageColor(name: string) {
  return STAGES.find((s) => s.name === name)?.color ?? "rgb(107, 114, 128)";
}

export default function OrganisationsPage() {
  const { contacts, loading } = useContacts();
  const { organizations, addOrganization, updateOrganization, deleteOrganization } =
    useOrganizations();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [presetName, setPresetName] = useState("");
  const [detail, setDetail] = useState<Account | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const accounts = useMemo(
    () => buildAccounts(contacts, organizations),
    [contacts, organizations],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const recordCount = accounts.filter((a) => a.isRecord).length;
  const autoCount = accounts.length - recordCount;

  // Détail à jour si les données changent (ex. après conversion).
  const liveDetail = useMemo(
    () => (detail ? accounts.find((a) => a.id === detail.id) ?? null : null),
    [detail, accounts],
  );

  const openCreate = () => {
    setEditing(null);
    setPresetName("");
    setFormOpen(true);
  };

  const openConvert = (a: Account) => {
    setEditing(null);
    setPresetName(a.name);
    setFormOpen(true);
  };

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Organisations</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {accounts.length} compte{accounts.length > 1 ? "s" : ""} — {recordCount} fiche
              {recordCount > 1 ? "s" : ""}, {autoCount} regroupé{autoCount > 1 ? "s" : ""} auto par
              société
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvelle organisation
          </button>
        </div>

        <div className="relative mt-4 sm:w-72">
          <Search
            className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une organisation…"
            className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {loading ? null : filtered.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-foreground mt-3 text-sm font-semibold">Aucune organisation</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Les sociétés de tes contacts apparaissent ici automatiquement, ou crée une fiche.
            </p>
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-(--shadow-card)">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Organisation</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Type</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Pays</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Étape</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Contacts</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setDetail(a)}
                    className="border-border hover:bg-muted/50 cursor-pointer border-t transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                          <Building2 className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-foreground block font-semibold">{a.name}</span>
                          {!a.isRecord && (
                            <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                              <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                              regroupé auto
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-foreground px-4 py-3 whitespace-nowrap">{a.type || "—"}</td>
                    <td className="text-foreground px-4 py-3 whitespace-nowrap">{a.country || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.stage ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stageColor(a.stage) }} />
                          {a.stage}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-foreground px-4 py-3 whitespace-nowrap">
                      <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {a.contacts.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {a.isRecord ? (
                          <button
                            type="button"
                            onClick={() => {
                              const org = organizations.find((o) => o.id === a.orgId) ?? null;
                              setEditing(org);
                              setPresetName("");
                              setFormOpen(true);
                            }}
                            className="hover:bg-muted rounded p-1.5 transition-colors"
                            aria-label="Modifier"
                          >
                            <Pencil className="h-4 w-4 text-gray-400" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openConvert(a)}
                            className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                          >
                            Créer la fiche
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

      {/* Détail d'un compte */}
      {liveDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-card flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-border flex items-start justify-between gap-3 border-b px-6 py-5">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <Building2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-foreground truncate text-lg font-bold">{liveDetail.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {liveDetail.type && (
                      <span className="bg-muted text-foreground rounded-full px-2.5 py-0.5 font-medium">
                        {liveDetail.type}
                      </span>
                    )}
                    {liveDetail.country && (
                      <span className="text-muted-foreground">{liveDetail.country}</span>
                    )}
                    {liveDetail.stage && (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stageColor(liveDetail.stage) }} />
                        {liveDetail.stage}
                      </span>
                    )}
                    {!liveDetail.isRecord && (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3" aria-hidden="true" /> regroupé auto par société
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="hover:bg-muted shrink-0 rounded p-1 transition-colors"
                aria-label="Fermer"
              >
                <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                  {liveDetail.contacts.length} contact{liveDetail.contacts.length > 1 ? "s" : ""}
                </p>
                {liveDetail.contacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Aucun contact rattaché pour le moment.</p>
                ) : (
                  <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                    {liveDetail.contacts.map((c) => (
                      <Link
                        key={c.id}
                        href={`/contacts?q=${encodeURIComponent(contactFullName(c) || c.email)}`}
                        className="hover:bg-muted flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="text-foreground min-w-0 truncate font-medium">
                          {contactFullName(c) || c.email || "—"}
                        </span>
                        <span className="text-muted-foreground shrink-0 truncate text-xs">
                          {c.email}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-border flex justify-end gap-3 border-t px-6 py-4">
              {liveDetail.isRecord ? (
                <>
                  {confirmDelete === liveDetail.orgId ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (liveDetail.orgId) await deleteOrganization(liveDetail.orgId);
                        setConfirmDelete(null);
                        setDetail(null);
                      }}
                      onBlur={() => setConfirmDelete(null)}
                      className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                    >
                      Confirmer la suppression
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(liveDetail.orgId ?? null)}
                      className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Supprimer la fiche
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const org = organizations.find((o) => o.id === liveDetail.orgId) ?? null;
                      setEditing(org);
                      setPresetName("");
                      setFormOpen(true);
                    }}
                    className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Modifier
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => openConvert(liveDetail)}
                  className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
                >
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  Créer la fiche Organisation
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <OrganizationFormModal
        open={formOpen}
        initial={editing}
        presetName={presetName}
        onClose={() => setFormOpen(false)}
        onSave={async (input) => {
          if (editing) await updateOrganization(editing.id, input);
          else await addOrganization(input);
        }}
      />
    </div>
  );
}
