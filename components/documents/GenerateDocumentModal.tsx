"use client";

import { useEffect, useRef, useState } from "react";
import { X, Copy, Download, Check, Loader2, AlertCircle } from "lucide-react";
import type { Contact } from "@/lib/contacts";
import type { DocumentTemplate } from "@/lib/documentTemplates";
import { authFetch } from "@/lib/rapport";

interface Props {
  contact: Contact;
  template: DocumentTemplate;
  onClose: () => void;
}

export default function GenerateDocumentModal({ contact, template, onClose }: Props) {
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/ai/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateContent: template.content,
          contact: contact as unknown as Record<string, string>,
        }),
      });
      const data = (await res.json()) as { document?: string; error?: string };
      if (data.error) { setError(data.error); return; }
      setDocument(data.document ?? "");
    } catch {
      setError("Erreur réseau — réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(document);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });

    const margin = 20;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const contentW = pageW - margin * 2;
    const lineH = 5.5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const lines = pdf.splitTextToSize(document, contentW) as string[];
    let y = margin;

    for (const line of lines) {
      if (y + lineH > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      // Bold for lines that look like section titles (ALL CAPS or short + colon)
      const isTitle = /^[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ\s\d–—.]{4,}$/.test(line.trim()) && line.trim().length < 60;
      pdf.setFont("helvetica", isTitle ? "bold" : "normal");
      pdf.text(line, margin, y);
      y += lineH;
    }

    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join("_") || contact.email;
    pdf.save(`${template.type}_${contactName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // Count remaining [À COMPLÉTER] placeholders
  const remaining = (document.match(/\[À COMPLÉTER/g) ?? []).length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                template.type === "NDA"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                  : template.type === "MOU"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-muted text-muted-foreground"
              }`}>{template.type}</span>
              <h2 className="text-foreground text-base font-bold truncate">{template.name}</h2>
            </div>
            <p className="text-muted-foreground text-xs mt-0.5">
              {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
              {contact.company ? ` · ${contact.company}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-muted shrink-0 rounded p-1.5 transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm">Génération du document par l'IA…</p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {!loading && !error && (
            <>
              {remaining > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  {remaining} champ{remaining > 1 ? "s" : ""} <strong>[À COMPLÉTER]</strong> à remplir manuellement.
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
                rows={24}
                spellCheck={false}
              />
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div className="border-border flex items-center justify-between gap-3 border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Modifie le texte ci-dessus directement, puis télécharge ou copie.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => void handleCopy()}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copié !" : "Copier"}
              </button>
              <button
                onClick={() => void handleDownload()}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                <Download className="h-4 w-4" />
                Télécharger PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
