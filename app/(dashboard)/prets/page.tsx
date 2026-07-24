"use client";

import { useMemo, useState } from "react";
import { Handshake, PackageCheck, Plus, Trash2, X } from "lucide-react";
import { contactFullName, dateKeyIn, todayKey, useContacts } from "@/lib/contacts";
import {
  GLOVE_COLORS,
  GLOVE_SIZES,
  GLOVE_TYPES,
  GloveColor,
  GloveSize,
  GloveType,
  gloveLabel,
  levelFor,
  useStock,
} from "@/lib/stock";
import { Loan, loanOverdue, useLoans } from "@/lib/loans";
import { logActivity } from "@/lib/activities";
import { contactCountry, exportStatusMeta, useCompliance } from "@/lib/compliance";

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

function formatDate(key: string) {
  if (!key) return "—";
  return new Date(key).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function PretsPage() {
  const { loans, loading, addLoan, updateLoan, deleteLoan } = useLoans();
  const { contacts } = useContacts();
  const { levels, addMovement } = useStock();
  const { statusFor } = useCompliance();

  const [formOpen, setFormOpen] = useState(false);
  const [returning, setReturning] = useState<Loan | null>(null);
  const [feedback, setFeedback] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Formulaire nouveau prêt
  const [contactId, setContactId] = useState("");
  const [type, setType] = useState<GloveType>(GLOVE_TYPES[0].id);
  const [color, setColor] = useState<GloveColor>(GLOVE_COLORS[0].id);
  const [size, setSize] = useState<GloveSize>(GLOVE_SIZES[0]);
  const [qty, setQty] = useState(1);
  const [loanedAt, setLoanedAt] = useState(todayKey());
  const [dueAt, setDueAt] = useState(dateKeyIn(30));
  const [notes, setNotes] = useState("");
  const [decrementStock, setDecrementStock] = useState(true);

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) =>
        (contactFullName(a) || a.email).localeCompare(contactFullName(b) || b.email),
      ),
    [contacts],
  );

  const outCount = loans.filter((l) => l.status === "out").length;
  const overdueCount = loans.filter(loanOverdue).length;
  const available = levelFor(levels, type, color, size);

  // Conformité export du destinataire (garde-fou avant expédition).
  const destContact = contacts.find((c) => c.id === contactId);
  const destCountry = destContact ? contactCountry(destContact) : "";
  const destStatus = statusFor(destCountry);
  const destMeta = exportStatusMeta(destStatus);

  const resetForm = () => {
    setContactId("");
    setType(GLOVE_TYPES[0].id);
    setColor(GLOVE_COLORS[0].id);
    setSize(GLOVE_SIZES[0]);
    setQty(1);
    setLoanedAt(todayKey());
    setDueAt(dateKeyIn(30));
    setNotes("");
    setDecrementStock(true);
    setError("");
  };

  const submitLoan = async () => {
    setError("");
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) {
      setError("Choisis un contact.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La quantité doit être supérieure à zéro.");
      return;
    }
    if (decrementStock) {
      const err = await addMovement({
        type,
        color,
        size,
        qty,
        direction: "out",
        note: `Prêt démo — ${contactFullName(contact) || contact.email}`,
      });
      if (err) {
        setError(err);
        return;
      }
    }
    await addLoan({
      contactId,
      contactName: contactFullName(contact) || contact.email,
      company: contact.company,
      type,
      color,
      size,
      qty,
      loanedAt,
      dueAt,
      returnedAt: "",
      status: "out",
      stockLinked: decrementStock,
      feedback: "",
      notes,
    });
    await logActivity({
      contactId,
      type: "loan",
      text: `Prêt : ${gloveLabel(type, color, size)} ×${qty} (retour prévu ${dueAt})`,
      auto: true,
    });
    setFormOpen(false);
    resetForm();
  };

  const confirmReturn = async () => {
    if (!returning) return;
    if (returning.stockLinked) {
      await addMovement({
        type: returning.type,
        color: returning.color,
        size: returning.size,
        qty: returning.qty,
        direction: "in",
        note: `Retour prêt — ${returning.contactName}`,
      });
    }
    await updateLoan(returning.id, {
      status: "returned",
      returnedAt: todayKey(),
      feedback: feedback.trim(),
    });
    setReturning(null);
    setFeedback("");
  };

  return (
    <div className="h-full">
      <div className="border-border bg-background/95 border-b px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">Prêts G.I.E</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {outCount} en prêt
              {overdueCount > 0 && (
                <span className="ml-1 font-semibold text-red-600">· {overdueCount} en retard</span>
              )}{" "}
              — suivi des démos confiées aux contacts, branché sur le stock
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
            className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau prêt
          </button>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {loading ? null : loans.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <Handshake className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-foreground mt-3 text-sm font-semibold">Aucun prêt en cours</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Enregistre un prêt de G.I.E confié à un contact pour une démo terrain.
            </p>
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-(--shadow-card)">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium">Contact</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Gant</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Qté</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Prêté le</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Retour prévu</th>
                  <th className="text-muted-foreground px-4 py-3 text-xs font-medium whitespace-nowrap">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => {
                  const overdue = loanOverdue(l);
                  return (
                    <tr key={l.id} className="border-border border-t">
                      <td className="px-4 py-3">
                        <span className="text-foreground block font-semibold">{l.contactName}</span>
                        {l.company && (
                          <span className="text-muted-foreground block text-xs">{l.company}</span>
                        )}
                        {l.feedback && (
                          <span className="text-muted-foreground mt-0.5 block max-w-64 truncate text-xs italic" title={l.feedback}>
                            « {l.feedback} »
                          </span>
                        )}
                      </td>
                      <td className="text-foreground px-4 py-3 whitespace-nowrap">
                        {gloveLabel(l.type, l.color, l.size)}
                      </td>
                      <td className="text-foreground px-4 py-3 whitespace-nowrap">{l.qty}</td>
                      <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                        {formatDate(l.loanedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className={overdue ? "font-semibold text-red-600" : "text-muted-foreground"}>
                          {formatDate(l.dueAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {l.status === "returned" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <PackageCheck className="h-3 w-3" aria-hidden="true" />
                            Rendu {l.returnedAt ? `le ${formatDate(l.returnedAt)}` : ""}
                          </span>
                        ) : overdue ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            En retard
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            En prêt
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          {l.status === "out" && (
                            <button
                              type="button"
                              onClick={() => {
                                setReturning(l);
                                setFeedback("");
                              }}
                              className="border-border hover:bg-muted rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                            >
                              Marquer rendu
                            </button>
                          )}
                          {confirmDelete === l.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                setConfirmDelete(null);
                                await deleteLoan(l.id);
                              }}
                              onBlur={() => setConfirmDelete(null)}
                              className="rounded bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
                            >
                              Sûr ?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(l.id)}
                              className="rounded p-1.5 transition-colors hover:bg-red-50"
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted-foreground mt-3 text-xs">
          Un prêt « décompté du stock » sort la quantité du Stock ; le marquer « rendu » la
          réintègre automatiquement.
        </p>
      </div>

      {/* Modal nouveau prêt */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFormOpen(false)}
        >
          <div className="bg-card w-full max-w-lg rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-border flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-foreground text-lg font-bold">Nouveau prêt</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="hover:bg-muted rounded p-1" aria-label="Fermer">
                <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="text-foreground mb-1 block text-xs font-medium">Contact</label>
                <select className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— Choisir un contact —</option>
                  {sortedContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {contactFullName(c) || c.email}
                      {c.company ? ` — ${c.company}` : ""}
                    </option>
                  ))}
                </select>
                {destCountry && destStatus !== "ok" && (
                  <p
                    className={
                      "mt-2 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium " +
                      destMeta.badge
                    }
                  >
                    <span className={"h-2 w-2 rounded-full " + destMeta.dot} />
                    Export vers {destCountry} : {destMeta.label}
                    {destStatus === "unknown" && " — classe ce pays dans Conformité export"}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-foreground mb-1 block text-xs font-medium">Modèle</label>
                  <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as GloveType)}>
                    {GLOVE_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-foreground mb-1 block text-xs font-medium">Coloris</label>
                  <select className={inputClass} value={color} onChange={(e) => setColor(e.target.value as GloveColor)}>
                    {GLOVE_COLORS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-foreground mb-1 block text-xs font-medium">Taille</label>
                  <select className={inputClass} value={size} onChange={(e) => setSize(e.target.value as GloveSize)}>
                    {GLOVE_SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-foreground mb-1 block text-xs font-medium">Quantité</label>
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={qty}
                    onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div>
                  <label className="text-foreground mb-1 block text-xs font-medium">Prêté le</label>
                  <input type="date" className={inputClass} value={loanedAt} onChange={(e) => setLoanedAt(e.target.value)} />
                </div>
                <div>
                  <label className="text-foreground mb-1 block text-xs font-medium">Retour prévu</label>
                  <input type="date" className={inputClass} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-foreground mb-1 block text-xs font-medium">Note (optionnel)</label>
                <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Unité, contexte du test…" />
              </div>

              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={decrementStock} onChange={(e) => setDecrementStock(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span className="text-foreground">
                  Décompter du stock{" "}
                  <span className="text-muted-foreground text-xs">
                    ({available} en stock pour {gloveLabel(type, color, size)})
                  </span>
                </span>
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="border-border flex justify-end gap-3 border-t px-6 py-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void submitLoan()}
                className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              >
                Enregistrer le prêt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal retour */}
      {returning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setReturning(null)}
        >
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-border flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-foreground text-lg font-bold">Retour du prêt</h2>
              <button type="button" onClick={() => setReturning(null)} className="hover:bg-muted rounded p-1" aria-label="Fermer">
                <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-muted-foreground text-sm">
                {gloveLabel(returning.type, returning.color, returning.size)} ×{returning.qty} —{" "}
                {returning.contactName}
                {returning.stockLinked && (
                  <span className="mt-1 block text-xs">La quantité sera réintégrée au stock.</span>
                )}
              </p>
              <div>
                <label className="text-foreground mb-1 block text-xs font-medium">
                  Retour terrain <span className="text-muted-foreground">(optionnel)</span>
                </label>
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Avis de l'unité, points forts, réserves, suite à donner…"
                />
              </div>
            </div>
            <div className="border-border flex justify-end gap-3 border-t px-6 py-4">
              <button
                type="button"
                onClick={() => setReturning(null)}
                className="border-border bg-card text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmReturn()}
                className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              >
                <PackageCheck className="h-4 w-4" aria-hidden="true" />
                Confirmer le retour
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
