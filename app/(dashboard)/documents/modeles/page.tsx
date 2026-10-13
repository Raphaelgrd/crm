"use client";

import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Upload, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  useDocumentTemplates,
  DocumentType,
  DocumentTemplateInput,
  DEFAULT_NDA_TEMPLATE,
  DEFAULT_MOU_TEMPLATE,
  DEFAULT_CERFA_TEMPLATE,
} from "@/lib/documentTemplates";

const TYPE_BADGE: Record<DocumentType, string> = {
  NDA: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  MOU: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  CERFA: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  Autre: "bg-muted text-muted-foreground border-border",
};

interface FormState { name: string; type: DocumentType; content: string }
const EMPTY: FormState = { name: "", type: "NDA", content: "" };

export default function ModelesPage() {
  const { templates, loading, saveTemplate, deleteTemplate } = useDocumentTemplates();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
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
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
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
      setForm((f) => ({ ...f, name: f.name || file.name.replace(/\.(docx?|pdf)$/i, ""), content: data.text ?? "" }));
    } catch { setExtractError("Erreur lors de la lecture du fichier."); }
    finally { setExtracting(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  function openCreate() { setEditingId(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setEditingId(id);
    setForm({ name: tpl.name, type: tpl.type, content: tpl.content });
    setShowForm(true);
  }
  function cancel() { setShowForm(false); setEditingId(null); setForm(EMPTY); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const input: DocumentTemplateInput = { name: form.name.trim(), type: form.type, content: form.content };
      await saveTemplate(input, editingId ?? undefined);
      cancel();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce modèle ?")) return;
    await deleteTemplate(id);
  }

  const DEFAULTS: Record<"NDA" | "MOU" | "CERFA", string> = {
    NDA: DEFAULT_NDA_TEMPLATE,
    MOU: DEFAULT_MOU_TEMPLATE,
    CERFA: DEFAULT_CERFA_TEMPLATE,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/documents" className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Modèles de documents</h1>
          <p className="text-sm text-muted-foreground">Personnalise les modèles NDA, MOU et CERFA</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> Nouveau modèle
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">{editingId ? "Modifier" : "Nouveau modèle"}</h2>
            <button onClick={cancel} className="p-1 rounded hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Nom *</label>
                <input
                  autoFocus required type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                  <option value="NDA">NDA</option>
                  <option value="MOU">MOU</option>
                  <option value="CERFA">CERFA</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileInputRef} type="file"
                accept=".docx,.doc,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden" onChange={(e) => void handleFileUpload(e)}
              />
              <button type="button" disabled={extracting}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {extracting ? "Extraction…" : "Importer DOCX / PDF"}
              </button>
              {!editingId && (["NDA", "MOU", "CERFA"] as const).map((t) => (
                <button key={t} type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t, name: f.name || t, content: DEFAULTS[t] }))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${TYPE_BADGE[t]} hover:opacity-80`}
                >
                  Modèle {t}
                </button>
              ))}
            </div>
            {extractError && <p className="text-xs text-destructive">{extractError}</p>}

            <div>
              <label className="block text-xs font-medium mb-1">Contenu * — utilise <code className="bg-muted px-1 rounded">{"{{variable}}"}</code></label>
              <textarea required rows={16} value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-input focus:outline-none focus:ring-2 focus:ring-ring font-mono resize-y"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancel}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors">
                Annuler
              </button>
              <button type="submit" disabled={saving || !form.name.trim() || !form.content.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                <Check className="h-4 w-4" /> Sauvegarder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium mb-1">Aucun modèle personnalisé</p>
          <p className="text-xs text-muted-foreground mb-4">Les modèles par défaut sont utilisés automatiquement.</p>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Créer un modèle
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_BADGE[tpl.type]}`}>{tpl.type}</span>
                  <h3 className="font-semibold text-sm truncate">{tpl.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 font-mono">
                  {tpl.content.slice(0, 100).replace(/\n/g, " ")}…
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Modifié le {new Date(tpl.updatedAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(tpl.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => void handleDelete(tpl.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
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
