"use client";

import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, FileSignature, Check, X, Info, Upload, Loader2 } from "lucide-react";
import {
  useDocumentTemplates,
  DocumentType,
  DocumentTemplateInput,
  DEFAULT_NDA_TEMPLATE,
  DEFAULT_MOU_TEMPLATE,
} from "@/lib/documentTemplates";

const TYPE_STYLES: Record<DocumentType, { badge: string }> = {
  NDA: { badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800" },
  MOU: { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  Autre: { badge: "bg-muted text-muted-foreground border-border" },
};

const VARS_GUIDE = [
  { var: "{{date}}", desc: "Date du jour (auto)" },
  { var: "{{client_nom_complet}}", desc: "Prénom + Nom du contact (auto)" },
  { var: "{{client_societe}}", desc: "Société du contact (auto)" },
  { var: "{{client_email}}", desc: "Email du contact (auto)" },
  { var: "{{client_telephone}}", desc: "Téléphone du contact (auto)" },
  { var: "{{client_pays}}", desc: "Pays du contact (auto)" },
  { var: "{{notre_societe}}", desc: "Votre société → IA ou [À COMPLÉTER]" },
  { var: "{{notre_adresse}}", desc: "Votre adresse → IA ou [À COMPLÉTER]" },
  { var: "{{signataire}}", desc: "Votre signataire → IA ou [À COMPLÉTER]" },
  { var: "{{objet_accord}}", desc: "Objet de l'accord → généré par l'IA" },
  { var: "{{juridiction}}", desc: "Droit applicable → déduit par l'IA" },
  { var: "{{duree_mois}}", desc: "Durée en mois → déduit par l'IA" },
];

interface FormState {
  name: string;
  type: DocumentType;
  content: string;
}

const EMPTY_FORM: FormState = { name: "", type: "NDA", content: "" };

export default function DocumentsPage() {
  const { templates, loading, saveTemplate, deleteTemplate } = useDocumentTemplates();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:...;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64, mimeType: file.type }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (data.error) { setExtractError(data.error); return; }
      setForm((f) => ({
        ...f,
        name: f.name || file.name.replace(/\.(docx?|pdf)$/i, ""),
        content: data.text ?? "",
      }));
    } catch {
      setExtractError("Erreur lors de la lecture du fichier.");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setEditingId(id);
    setForm({ name: tpl.name, type: tpl.type, content: tpl.content });
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const input: DocumentTemplateInput = {
        name: form.name.trim(),
        type: form.type,
        content: form.content,
      };
      await saveTemplate(input, editingId ?? undefined);
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce modèle ?")) return;
    await deleteTemplate(id);
  }

  function loadDefault(type: "NDA" | "MOU") {
    setForm((f) => ({
      ...f,
      name: f.name || (type === "NDA" ? "Accord de confidentialité (NDA)" : "Mémorandum d'entente (MOU)"),
      type,
      content: type === "NDA" ? DEFAULT_NDA_TEMPLATE : DEFAULT_MOU_TEMPLATE,
    }));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <FileSignature className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Documents légaux</h1>
            <p className="text-sm text-muted-foreground">Modèles NDA & MOU remplis automatiquement par l'IA</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Nouveau modèle
        </button>
      </div>

      {/* Variable guide */}
      <div className="mb-6 rounded-xl border border-border bg-muted/30">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-left"
        >
          <Info className="h-4 w-4 text-primary shrink-0" />
          Guide des variables — utilise <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{variable}}"}</code> dans tes modèles
          <span className="ml-auto text-muted-foreground text-xs">{showGuide ? "Fermer ▲" : "Voir ▼"}</span>
        </button>
        {showGuide && (
          <div className="border-t border-border px-4 pb-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VARS_GUIDE.map((v) => (
                <div key={v.var} className="flex items-start gap-2 text-sm">
                  <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono shrink-0">{v.var}</code>
                  <span className="text-muted-foreground">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">{editingId ? "Modifier le modèle" : "Nouveau modèle"}</h2>
            <button onClick={cancel} className="p-1 rounded hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Nom du modèle *</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ex : NDA standard investisseur"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as DocumentType })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="NDA">NDA — Accord de confidentialité</option>
                  <option value="MOU">MOU — Mémorandum d'entente</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>

            {/* File upload */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => void handleFileUpload(e)}
              />
              <button
                type="button"
                disabled={extracting}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {extracting ? "Extraction…" : "Importer DOCX / PDF"}
              </button>
              {!editingId && (
                <>
                  <span className="text-xs text-muted-foreground">ou partir d'un modèle :</span>
                  <button type="button" onClick={() => loadDefault("NDA")}
                    className="text-xs px-2.5 py-1 rounded border border-violet-200 text-violet-700 dark:border-violet-800 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                    Modèle NDA
                  </button>
                  <button type="button" onClick={() => loadDefault("MOU")}
                    className="text-xs px-2.5 py-1 rounded border border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    Modèle MOU
                  </button>
                </>
              )}
            </div>
            {extractError && (
              <p className="text-xs text-destructive">{extractError}</p>
            )}

            <div>
              <label className="block text-xs font-medium mb-1">
                Contenu du modèle * — utilise <code className="bg-muted px-1 rounded">{"{{variable}}"}</code> pour les champs dynamiques
              </label>
              <textarea
                required
                rows={18}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Colle ici le texte de ton modèle…"
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring font-mono resize-y"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving || !form.name.trim() || !form.content.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? null : <Check className="h-4 w-4" />}
                Sauvegarder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileSignature className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">Aucun modèle pour l'instant</p>
          <p className="text-xs text-muted-foreground mb-4">
            Crée ton premier modèle NDA ou MOU. L'IA remplira automatiquement les champs à partir des fiches client.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Créer un modèle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-start gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_STYLES[tpl.type].badge}`}>
                    {tpl.type}
                  </span>
                  <h3 className="font-semibold text-sm truncate">{tpl.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 font-mono">
                  {tpl.content.slice(0, 120).replace(/\n/g, " ")}…
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Modifié le {new Date(tpl.updatedAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(tpl.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void handleDelete(tpl.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
