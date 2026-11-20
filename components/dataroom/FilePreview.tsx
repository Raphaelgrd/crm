"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileIcon, Loader2, X } from "lucide-react";

// Aperçu d'un fichier de la Data Room avant téléchargement (équipe et invités) :
// PDF, Word (.docx), Excel (.xlsx), images, textes/CSV. Le contenu Word est affiché dans un cadre
// isolé (sandbox sans script) ; les tableaux Excel sont rendus en texte (aucun HTML du fichier n'est exécuté).

type Kind = "image" | "pdf" | "video" | "docx" | "xlsx" | "pptx" | "text" | "none";

const ext = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

export function previewKind(name: string, mime: string): Kind {
  const e = ext(name);
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "image";
  if (mime === "application/pdf" || e === "pdf") return "pdf";
  if (mime.startsWith("video/") || ["mp4", "m4v", "mov", "webm"].includes(e)) return "video";
  if (e === "docx") return "docx";
  if (e === "pptx" || e === "ppsx") return "pptx";
  if (e === "xlsx" || e === "xlsm") return "xlsx";
  if (["txt", "csv", "md", "json"].includes(e) || mime.startsWith("text/")) return "text";
  return "none";
}

const MAX_ROWS = 500;
const MAX_COLS = 40;

type Sheet = { name: string; rows: string[][]; truncated: boolean };

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toLocaleDateString("fr-FR");
  if (typeof v === "number") return v.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
  if (typeof v === "boolean") return v ? "VRAI" : "FAUX";
  return String(v);
}

const DOCX_STYLE = `<style>
body{font-family:Calibri,Arial,sans-serif;color:#1f2937;background:#fff;max-width:820px;margin:0 auto;padding:40px 48px;line-height:1.55;font-size:15px}
h1,h2,h3{line-height:1.25;color:#111827} table{border-collapse:collapse;margin:12px 0} td,th{border:1px solid #d1d5db;padding:4px 8px;vertical-align:top}
img{max-width:100%;height:auto} p{margin:0 0 10px}
</style>`;

export function FilePreview({
  name,
  mime,
  load,
  streamUrl,
  onDownload,
  onClose,
}: {
  /** Vidéos : adresse de lecture en continu (lecture immédiate, sans télécharger tout le fichier). */
  streamUrl?: () => Promise<string>;
  name: string;
  mime: string;
  /** Charge le contenu du fichier (déjà autorisé par l'appelant). */
  load: () => Promise<Blob>;
  onDownload: () => void;
  onClose: () => void;
}) {
  const kind = useMemo(() => previewKind(name, mime), [name, mime]);
  const [state, setState] = useState<
    | { s: "loading" }
    | { s: "error"; msg: string }
    | { s: "url"; url: string }
    | { s: "html"; html: string }
    | { s: "sheets"; sheets: Sheet[] }
    | { s: "text"; text: string; truncated: boolean }
    | { s: "pptx"; buffer: ArrayBuffer }
    | { s: "none" }
  >({ s: kind === "none" ? "none" : "loading" });
  const [sheet, setSheet] = useState(0);

  useEffect(() => {
    if (kind === "none") return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        if (kind === "video" && streamUrl) {
          const u = await streamUrl();
          if (!cancelled) setState({ s: "url", url: u });
          return;
        }
        const blob = await load();
        if (cancelled) return;
        if (kind === "image" || kind === "pdf" || kind === "video") {
          // On force le bon type pour que le navigateur lise le fichier même s'il a été enregistré sans type.
          const videoType = ext(name) === "webm" ? "video/webm" : ext(name) === "mov" ? "video/quicktime" : "video/mp4";
          const type = kind === "pdf" ? "application/pdf" : kind === "video" ? (mime.startsWith("video/") ? mime : videoType) : blob.type || mime;
          const typed = new Blob([blob], { type });
          url = URL.createObjectURL(typed);
          setState({ s: "url", url });
        } else if (kind === "docx") {
          const mammoth = (await import("mammoth")).default;
          const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          if (!cancelled) setState({ s: "html", html: `<!doctype html><meta charset="utf-8">${DOCX_STYLE}${value || "<p><em>Document vide.</em></p>"}` });
        } else if (kind === "xlsx") {
          const readXlsxFile = (await import("read-excel-file/browser")).default;
          const all = await readXlsxFile(blob);
          const sheets = all.map((s) => {
            const rows = s.data.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map(cellText));
            const truncated = s.data.length > MAX_ROWS || s.data.some((r) => r.length > MAX_COLS);
            return { name: s.sheet, rows, truncated };
          });
          if (!cancelled) setState({ s: "sheets", sheets });
        } else if (kind === "pptx") {
          const buffer = await blob.arrayBuffer();
          if (!cancelled) setState({ s: "pptx", buffer });
        } else if (kind === "text") {
          const text = await blob.slice(0, 300_000).text();
          if (!cancelled) setState({ s: "text", text, truncated: blob.size > 300_000 });
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[aperçu]", e);
          setState({ s: "error", msg: e instanceof Error && e.message ? e.message : "Aperçu impossible." });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [kind, load, mime, streamUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = state.s === "sheets" ? state.sheets[Math.min(sheet, state.sheets.length - 1)] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Aperçu de ${name}`}>
      <div className="flex items-center justify-between gap-3 bg-neutral-950 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate text-sm font-semibold text-white" title={name}>{name}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Télécharger
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20" aria-label="Fermer l'aperçu">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
        {state.s === "loading" && (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Chargement de l&apos;aperçu…
          </div>
        )}

        {(state.s === "none" || state.s === "error") && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-white">
            <FileIcon className="h-16 w-16 text-white/30" aria-hidden="true" />
            <p className="text-sm text-white/70">
              {state.s === "error"
                ? `Aperçu impossible pour ce fichier (${state.msg}).`
                : `Pas d'aperçu pour les fichiers .${ext(name) || "?"} : télécharge-le pour l'ouvrir.`}
            </p>
            <button type="button" onClick={onDownload} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20">
              <Download className="h-4 w-4" aria-hidden="true" />
              Télécharger
            </button>
          </div>
        )}

        {state.s === "url" && kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.url} alt={name} className="h-full w-full object-contain" />
        )}
        {state.s === "url" && kind === "pdf" && <iframe src={state.url} className="h-full w-full border-0 bg-white" title={name} />}
        {state.s === "url" && kind === "video" && (
          <video src={state.url} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" aria-label={name}>
            Ton navigateur ne peut pas lire cette vidéo : télécharge-la.
          </video>
        )}

        {state.s === "pptx" && <PptxFrame name={name} buffer={state.buffer} />}

        {state.s === "html" && (
          <iframe sandbox="" srcDoc={state.html} className="h-full w-full border-0 bg-white" title={name} />
        )}

        {state.s === "text" && (
          <div className="flex-1 overflow-auto bg-white p-6">
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-gray-800">{state.text}</pre>
            {state.truncated && <p className="mt-4 text-xs text-gray-500">Aperçu limité au début du fichier. Télécharge-le pour tout voir.</p>}
          </div>
        )}

        {state.s === "sheets" && (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            {state.sheets.length > 1 && (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 pt-2" role="tablist">
                {state.sheets.map((s, i) => (
                  <button
                    key={s.name + i}
                    type="button"
                    role="tab"
                    aria-selected={i === sheet}
                    onClick={() => setSheet(i)}
                    className={
                      "shrink-0 rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-semibold " +
                      (i === sheet ? "border-gray-300 bg-white text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800")
                    }
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {current && current.rows.length ? (
                <table className="border-collapse text-xs text-gray-800 tabular-nums">
                  <tbody>
                    {current.rows.map((r, i) => (
                      <tr key={i} className={i === 0 ? "bg-gray-50 font-semibold" : undefined}>
                        <td className="sticky left-0 border border-gray-200 bg-gray-100 px-2 py-1 text-right text-[10px] text-gray-400">{i + 1}</td>
                        {r.map((c, j) => (
                          <td key={j} className="max-w-[320px] truncate border border-gray-200 px-2 py-1" title={c}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-6 text-sm text-gray-500">Feuille vide.</p>
              )}
              {current?.truncated && (
                <p className="p-3 text-xs text-gray-500">
                  Aperçu limité à {MAX_ROWS} lignes et {MAX_COLS} colonnes. Télécharge le fichier pour tout voir.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PowerPoint : rendu dans un cadre « bac à sable » sans origine (pas d'allow-same-origin) qui charge /apercu-pptx.
 * Le contenu du fichier est envoyé par message ; le cadre n'a accès ni à la session ni aux données du CRM.
 */
function PptxFrame({ name, buffer }: { name: string; buffer: ArrayBuffer }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const onMessage = (e: MessageEvent<{ type?: string; message?: string }>) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      if (e.data?.type === "pptx-ready") {
        const copy = buffer.slice(0);
        // Le cadre n'a pas d'origine (« null ») : « * » est la seule cible possible ; seul ce cadre reçoit le message.
        frame.current.contentWindow?.postMessage({ type: "pptx", buffer: copy }, "*", [copy]);
      }
      if (e.data?.type === "pptx-error") setError(e.data.message || "fichier illisible");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [buffer]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {error && <p className="bg-amber-50 px-4 py-2 text-sm text-amber-900">Aperçu impossible ({error}) : télécharge le fichier pour l&apos;ouvrir.</p>}
      <iframe ref={frame} src="/apercu-pptx" sandbox="allow-scripts" title={name} className="min-h-0 w-full flex-1 border-0 bg-gray-200" />
    </div>
  );
}
