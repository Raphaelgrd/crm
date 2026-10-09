"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Minus,
  MousePointerClick,
  MoveVertical,
  Pencil,
  Trash2,
  Type,
} from "lucide-react";
import {
  BlockType,
  ButtonProps,
  DEFAULT_SETTINGS,
  DividerProps,
  EmailBlock,
  EmailTemplate,
  HeadingProps,
  ImageProps,
  SpacerProps,
  TemplateType,
  TextProps,
  VARIABLES,
  fillVariables,
  makeBlock,
  renderEmailHtml,
  renderEmailText,
  renderPlainText,
  useTemplates,
} from "@/lib/templates";

const PALETTE: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "heading", label: "Titre", icon: Heading1 },
  { type: "text", label: "Texte", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "button", label: "Bouton", icon: MousePointerClick },
  { type: "divider", label: "Séparateur", icon: Minus },
  { type: "spacer", label: "Espaceur", icon: MoveVertical },
];

const TYPE_ICONS: Record<TemplateType, typeof Mail> = {
  Email: Mail,
  SMS: MessageSquare,
  Note: FileText,
};

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 w-full rounded-lg border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none";
const labelClass = "text-muted-foreground mb-1 block text-xs font-medium";

type DragItem = { kind: "new"; type: BlockType } | { kind: "move"; index: number };

function newDraft(): EmailTemplate {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "Nouveau template",
    type: "Email",
    subject: "",
    blocks: [makeBlock("heading"), makeBlock("text"), makeBlock("button")],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

function smsSegments(text: string): number {
  if (text.length <= 160) return 1;
  return Math.ceil(text.length / 153);
}

function smsCounter(text: string): string {
  const segs = smsSegments(text);
  return segs === 1 ? `${text.length} / 160` : `${text.length} car. — ${segs} SMS`;
}

export default function TemplateBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getTemplate, addTemplate, updateTemplate } = useTemplates();

  const [tpl, setTpl] = useState<EmailTemplate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false);
  const [saved, setSaved] = useState(false);
  const dragItem = useRef<DragItem | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const plainTextRef = useRef<HTMLTextAreaElement>(null);

  const isNew = params.id === "new";

  useEffect(() => {
    if (isNew) { setTpl(newDraft()); return; }
    void getTemplate(params.id).then((t) => {
      if (t) setTpl(t);
      else setNotFound(true);
    });
  }, [isNew, params.id, getTemplate]);

  const patch = useCallback((changes: Partial<EmailTemplate>) => {
    setSaved(false);
    setTpl((t) => (t ? { ...t, ...changes } : t));
  }, []);

  const patchBlock = useCallback((id: string, props: Partial<EmailBlock["props"]>) => {
    setSaved(false);
    setTpl((t) =>
      t
        ? {
            ...t,
            blocks: t.blocks.map((b) =>
              b.id === id ? { ...b, props: { ...b.props, ...props } as EmailBlock["props"] } : b,
            ),
          }
        : t,
    );
  }, []);

  const insertBlock = (type: BlockType, index: number) => {
    const block = makeBlock(type);
    setSaved(false);
    setTpl((t) => {
      if (!t) return t;
      const blocks = [...t.blocks];
      blocks.splice(index, 0, block);
      return { ...t, blocks };
    });
    setSelectedId(block.id);
  };

  const moveBlock = (from: number, to: number) => {
    setSaved(false);
    setTpl((t) => {
      if (!t || to < 0 || to > t.blocks.length) return t;
      const blocks = [...t.blocks];
      const [b] = blocks.splice(from, 1);
      blocks.splice(from < to ? to - 1 : to, 0, b);
      return { ...t, blocks };
    });
  };

  const removeBlock = (id: string) => {
    setSaved(false);
    setTpl((t) => (t ? { ...t, blocks: t.blocks.filter((b) => b.id !== id) } : t));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateBlock = (index: number) => {
    setSaved(false);
    setTpl((t) => {
      if (!t) return t;
      const src = t.blocks[index];
      const copy = { ...src, id: makeBlock(src.type).id, props: { ...src.props } };
      const blocks = [...t.blocks];
      blocks.splice(index + 1, 0, copy);
      return { ...t, blocks };
    });
  };

  const handleDrop = (index: number) => {
    const item = dragItem.current;
    dragItem.current = null;
    setDropIndex(null);
    if (!item) return;
    if (item.kind === "new") insertBlock(item.type, index);
    else moveBlock(item.index, index);
  };

  function insertPlainTextVariable(token: string) {
    const ta = plainTextRef.current;
    const current = tpl?.plainText ?? "";
    if (!ta) { patch({ plainText: current + token }); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    patch({ plainText: current.slice(0, start) + token + current.slice(end) });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const handleSave = async () => {
    if (!tpl) return;
    if (isNew && !tpl.id) {
      const created = await addTemplate({
        name: tpl.name,
        type: tpl.type,
        subject: tpl.subject,
        blocks: tpl.blocks,
        settings: tpl.settings,
        plainText: tpl.plainText,
      });
      setTpl(created);
      setSaved(true);
      router.replace(`/templates/${created.id}`);
    } else {
      await updateTemplate(tpl.id, {
        name: tpl.name,
        type: tpl.type,
        subject: tpl.subject,
        blocks: tpl.blocks,
        settings: tpl.settings,
        plainText: tpl.plainText,
      });
      setSaved(true);
    }
  };

  const handleCopyHtml = async () => {
    if (!tpl) return;
    await navigator.clipboard.writeText(renderEmailHtml(tpl));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function handleUse() {
    if (!tpl) return;
    if (tpl.type === "Email") {
      window.location.href = `mailto:?subject=${encodeURIComponent(tpl.subject)}&body=${encodeURIComponent(renderEmailText(tpl))}`;
    } else if (tpl.type === "SMS") {
      window.location.href = `sms:?body=${encodeURIComponent(renderPlainText(tpl))}`;
    } else {
      void navigator.clipboard.writeText(fillVariables(renderPlainText(tpl))).then(() => {
        setUsed(true);
        setTimeout(() => setUsed(false), 2000);
      });
    }
  }

  if (notFound) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground text-sm">
          Template introuvable.{" "}
          <Link href="/templates" className="text-primary font-semibold hover:underline">
            Retour aux templates
          </Link>
        </p>
      </div>
    );
  }

  if (!tpl) return null;

  const selected = tpl.blocks.find((b) => b.id === selectedId) ?? null;
  const isEmail = tpl.type === "Email";

  return (
    <div className="flex h-full flex-col">
      {/* Barre du haut */}
      <div className="border-border bg-background/95 flex flex-wrap items-center gap-3 border-b px-4 py-3 backdrop-blur-sm sm:px-6">
        <Link
          href="/templates"
          className="hover:bg-muted rounded-lg p-2 transition-colors"
          aria-label="Retour aux templates"
        >
          <ArrowLeft className="text-muted-foreground h-4 w-4" aria-hidden="true" />
        </Link>

        {/* Sélecteur de type */}
        <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-0.5">
          {(["Email", "SMS", "Note"] as TemplateType[]).map((t) => {
            const TIcon = TYPE_ICONS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => patch({ type: t })}
                className={
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
                  (tpl.type === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <TIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {t}
              </button>
            );
          })}
        </div>

        {/* Nom */}
        <input
          value={tpl.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="text-foreground hover:border-border focus:border-border w-44 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-bold focus:outline-none"
          aria-label="Nom du template"
        />

        {/* Sujet (Email + Note) */}
        {tpl.type !== "SMS" ? (
          <input
            value={tpl.subject}
            onChange={(e) => patch({ subject: e.target.value })}
            placeholder={isEmail ? "Sujet de l'email…" : "Titre de la note…"}
            className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
            aria-label={isEmail ? "Sujet de l'email" : "Titre de la note"}
          />
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="flex items-center gap-2">
          {/* Aperçu — Email uniquement */}
          {isEmail && (
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className={
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors " +
                (preview
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted")
              }
            >
              {preview ? (
                <Pencil className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              {preview ? "Éditer" : "Aperçu"}
            </button>
          )}

          {/* Copier HTML — Email uniquement */}
          {isEmail && (
            <button
              type="button"
              onClick={() => void handleCopyHtml()}
              className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Copié !" : "Copier HTML"}
            </button>
          )}

          {/* Utiliser */}
          <button
            type="button"
            onClick={handleUse}
            className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
          >
            {used ? (
              <><Check className="h-4 w-4 text-green-600" aria-hidden="true" /> Copié !</>
            ) : tpl.type === "Note" ? (
              <><ClipboardCopy className="h-4 w-4" aria-hidden="true" /> Copier</>
            ) : (
              <><ExternalLink className="h-4 w-4" aria-hidden="true" /> Utiliser</>
            )}
          </button>

          {/* Enregistrer */}
          <button
            type="button"
            onClick={() => void handleSave()}
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            {saved ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            {saved ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Contenu */}
      {isEmail ? (
        preview ? (
          <iframe
            title="Aperçu de l'email"
            className="min-h-0 flex-1 border-0"
            srcDoc={fillVariables(renderEmailHtml(tpl))}
          />
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Palette */}
            <div className="border-border w-44 shrink-0 space-y-2 overflow-y-auto border-r p-3">
              <p className="text-muted-foreground px-1 text-xs font-semibold uppercase">Blocs</p>
              {PALETTE.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  draggable
                  onDragStart={() => { dragItem.current = { kind: "new", type }; }}
                  onDragEnd={() => { dragItem.current = null; setDropIndex(null); }}
                  onClick={() => insertBlock(type, tpl.blocks.length)}
                  className="border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted flex w-full cursor-grab items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium shadow-sm transition-colors active:cursor-grabbing"
                  title={`Ajouter un bloc ${label}`}
                >
                  <Icon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
              <p className="text-muted-foreground px-1 pt-2 text-[11px] leading-relaxed">
                Clique pour ajouter en bas, ou glisse un bloc directement dans l&apos;email.
              </p>
            </div>

            {/* Canvas */}
            <div
              className="min-w-0 flex-1 overflow-y-auto p-6"
              style={{ backgroundColor: tpl.settings.bgColor }}
              onClick={() => setSelectedId(null)}
              onDragOver={(e) => { e.preventDefault(); if (dropIndex === null) setDropIndex(tpl.blocks.length); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(dropIndex ?? tpl.blocks.length); }}
            >
              <div
                className="mx-auto w-full max-w-[600px] rounded-lg py-4 shadow-sm"
                style={{ backgroundColor: tpl.settings.contentBgColor }}
                onClick={(e) => e.stopPropagation()}
              >
                {tpl.blocks.length === 0 && (
                  <p className="text-muted-foreground p-10 text-center text-sm">
                    Email vide — ajoute des blocs depuis la palette à gauche.
                  </p>
                )}
                {tpl.blocks.map((block, index) => (
                  <div key={block.id}>
                    {dropIndex === index && (
                      <div className="bg-primary mx-8 h-0.5 rounded" aria-hidden="true" />
                    )}
                    <BlockView
                      block={block}
                      selected={selectedId === block.id}
                      onSelect={() => setSelectedId(block.id)}
                      onDragStart={() => { dragItem.current = { kind: "move", index }; }}
                      onDragEnd={() => { dragItem.current = null; setDropIndex(null); }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDropIndex(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
                      }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(dropIndex ?? index); }}
                      onMoveUp={index > 0 ? () => moveBlock(index, index - 1) : undefined}
                      onMoveDown={index < tpl.blocks.length - 1 ? () => moveBlock(index, index + 2) : undefined}
                      onDuplicate={() => duplicateBlock(index)}
                      onRemove={() => removeBlock(block.id)}
                    />
                  </div>
                ))}
                {dropIndex === tpl.blocks.length && tpl.blocks.length > 0 && (
                  <div className="bg-primary mx-8 h-0.5 rounded" aria-hidden="true" />
                )}
              </div>
            </div>

            {/* Réglages */}
            <div className="border-border w-72 shrink-0 overflow-y-auto border-l p-4">
              {selected ? (
                <BlockSettings block={selected} onChange={(props) => patchBlock(selected.id, props)} />
              ) : (
                <div className="space-y-4">
                  <p className="text-foreground text-sm font-semibold">Réglages de l&apos;email</p>
                  <div>
                    <label className={labelClass}>Couleur de fond (page)</label>
                    <input
                      type="color"
                      value={tpl.settings.bgColor}
                      onChange={(e) => patch({ settings: { ...tpl.settings, bgColor: e.target.value } })}
                      className="border-border h-9 w-full cursor-pointer rounded border"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Couleur de fond (contenu)</label>
                    <input
                      type="color"
                      value={tpl.settings.contentBgColor}
                      onChange={(e) => patch({ settings: { ...tpl.settings, contentBgColor: e.target.value } })}
                      className="border-border h-9 w-full cursor-pointer rounded border"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Sélectionne un bloc dans l&apos;email pour modifier son contenu et son style.
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        /* SMS / Note : éditeur plein texte */
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
            <div className="flex items-center justify-between">
              <span className="text-foreground text-sm font-semibold">
                {tpl.type === "SMS" ? "Message SMS" : "Corps de la note"}
              </span>
              {tpl.type === "SMS" && (
                <span className="text-muted-foreground tabular-nums text-xs">
                  {smsCounter(tpl.plainText ?? "")}
                </span>
              )}
            </div>
            <textarea
              ref={plainTextRef}
              className="border-border bg-card text-foreground focus:border-primary/50 focus:ring-primary/20 flex-1 resize-none rounded-xl border p-4 text-sm leading-relaxed focus:ring-2 focus:outline-none"
              value={tpl.plainText ?? ""}
              onChange={(e) => patch({ plainText: e.target.value })}
              placeholder={
                tpl.type === "SMS"
                  ? "Bonjour {{firstName}}, votre message ici…"
                  : "Votre note ici…\n\nUtilisez {{firstName}}, {{lastName}}, {{companyName}}…"
              }
            />
            {tpl.type === "SMS" && (
              <p className="text-muted-foreground text-xs">
                SMS standard : 160 car. Au-delà, fractionné en segments de 153 car.
              </p>
            )}
          </div>

          {/* Panel variables */}
          <div className="border-border w-72 shrink-0 overflow-y-auto border-l p-4">
            <div className="space-y-4">
              <p className="text-foreground text-sm font-semibold">Variables</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Cliquez pour insérer à la position du curseur.
              </p>
              <div className="flex flex-col gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertPlainTextVariable(v.token)}
                    className="border-border bg-card hover:border-primary/30 hover:bg-primary/5 hover:text-primary flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors"
                  >
                    <span className="text-foreground font-medium">{v.label}</span>
                    <code className="text-muted-foreground font-mono">{v.token}</code>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- BlockView ---

function BlockView({
  block, selected, onSelect, onDragStart, onDragEnd, onDragOver, onDrop,
  onMoveUp, onMoveDown, onDuplicate, onRemove,
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={
        "group relative cursor-pointer transition-shadow " +
        (selected ? "ring-primary ring-2 ring-inset" : "hover:ring-primary/30 hover:ring-2 hover:ring-inset")
      }
    >
      <div
        className={
          "border-border bg-background absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border p-0.5 shadow-md transition-opacity " +
          (selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")
        }
      >
        <span className="cursor-grab p-1 active:cursor-grabbing" title="Glisser pour déplacer">
          <GripVertical className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }} disabled={!onMoveUp}
          className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Monter le bloc">
          <ArrowUp className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }} disabled={!onMoveDown}
          className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Descendre le bloc">
          <ArrowDown className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="rounded p-1 hover:bg-muted" aria-label="Dupliquer le bloc">
          <Copy className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded p-1 hover:bg-destructive/10" aria-label="Supprimer le bloc">
          <Trash2 className="text-muted-foreground h-3.5 w-3.5 hover:text-destructive" aria-hidden="true" />
        </button>
      </div>
      <BlockContent block={block} />
    </div>
  );
}

function BlockContent({ block }: { block: EmailBlock }) {
  const font = { fontFamily: "Arial, Helvetica, sans-serif" };
  switch (block.type) {
    case "heading": {
      const p = block.props as HeadingProps;
      return (
        <div className="whitespace-pre-wrap px-8 py-3 font-bold"
          style={{ ...font, fontSize: p.fontSize, color: p.color, textAlign: p.align, lineHeight: 1.3 }}>
          {p.text || "Titre vide"}
        </div>
      );
    }
    case "text": {
      const p = block.props as TextProps;
      return (
        <div className="whitespace-pre-wrap px-8 py-2"
          style={{ ...font, fontSize: p.fontSize, color: p.color, textAlign: p.align, lineHeight: 1.6 }}>
          {p.text || "Texte vide"}
        </div>
      );
    }
    case "image": {
      const p = block.props as ImageProps;
      return (
        <div className="px-8 py-2" style={{ textAlign: p.align }}>
          {p.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.src} alt={p.alt}
              style={{ width: `${p.width}%`, display: "inline-block", height: "auto" }} />
          ) : (
            <div className="bg-muted text-muted-foreground border-border flex h-28 items-center justify-center rounded border border-dashed text-xs">
              Image — renseigne une URL dans le panneau de droite
            </div>
          )}
        </div>
      );
    }
    case "button": {
      const p = block.props as ButtonProps;
      return (
        <div className="px-8 py-3" style={{ textAlign: p.align }}>
          <span className="inline-block px-7 py-3 text-sm font-bold"
            style={{ ...font, backgroundColor: p.bgColor, color: p.textColor, borderRadius: p.radius }}>
            {p.label || "Bouton"}
          </span>
        </div>
      );
    }
    case "divider": {
      const p = block.props as DividerProps;
      return (
        <div className="px-8 py-3">
          <div style={{ borderTop: `${p.thickness}px solid ${p.color}` }} />
        </div>
      );
    }
    case "spacer": {
      const p = block.props as SpacerProps;
      return (
        <div className="text-muted-foreground flex items-center justify-center text-[10px]"
          style={{ height: p.height }}>
          {p.height}px
        </div>
      );
    }
  }
}

// --- Panneau de réglages ---

function VariablePicker({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div>
      <label className={labelClass}>Insérer une variable</label>
      <select className={inputClass} value=""
        onChange={(e) => { if (e.target.value) onInsert(e.target.value); e.target.value = ""; }}>
        <option value="">Choisir…</option>
        {VARIABLES.map((v) => (
          <option key={v.token} value={v.token}>{v.label} — {v.token}</option>
        ))}
      </select>
    </div>
  );
}

function AlignPicker({ value, onChange }: {
  value: "left" | "center" | "right";
  onChange: (v: "left" | "center" | "right") => void;
}) {
  return (
    <div>
      <label className={labelClass}>Alignement</label>
      <div className="flex gap-1">
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} type="button" onClick={() => onChange(a)}
            className={
              "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors " +
              (value === a
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted")
            }>
            {a === "left" ? "Gauche" : a === "center" ? "Centre" : "Droite"}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockSettings({ block, onChange }: {
  block: EmailBlock;
  onChange: (props: Partial<EmailBlock["props"]>) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const title = PALETTE.find((p) => p.type === block.type)?.label ?? block.type;

  function insertVariable(token: string) {
    const ta = textareaRef.current;
    const current = (block.props as TextProps).text;
    if (!ta) { onChange({ text: current + token }); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    onChange({ text: current.slice(0, start) + token + current.slice(end) });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-foreground text-sm font-semibold">Bloc : {title}</p>

      {(block.type === "heading" || block.type === "text") && (
        <>
          <div>
            <label className={labelClass}>Texte</label>
            <textarea
              ref={textareaRef}
              className={`${inputClass} min-h-28 resize-y`}
              value={(block.props as TextProps).text}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </div>
          <VariablePicker onInsert={insertVariable} />
          <AlignPicker value={(block.props as TextProps).align} onChange={(align) => onChange({ align })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Taille (px)</label>
              <input type="number" min={8} max={72} className={inputClass}
                value={(block.props as TextProps).fontSize}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) || 14 })} />
            </div>
            <div>
              <label className={labelClass}>Couleur</label>
              <input type="color" className="border-border h-9 w-full cursor-pointer rounded border"
                value={(block.props as TextProps).color}
                onChange={(e) => onChange({ color: e.target.value })} />
            </div>
          </div>
        </>
      )}

      {block.type === "image" && (
        <>
          <div>
            <label className={labelClass}>Image</label>
            <label className="border-border bg-card text-foreground hover:bg-muted mb-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors">
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              Choisir depuis le PC
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => onChange({ src: reader.result as string });
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </label>
            <input className={inputClass} placeholder="…ou coller une URL"
              value={(block.props as ImageProps).src.startsWith("data:") ? "" : (block.props as ImageProps).src}
              onChange={(e) => onChange({ src: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Texte alternatif</label>
            <input className={inputClass} value={(block.props as ImageProps).alt}
              onChange={(e) => onChange({ alt: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Lien au clic (optionnel)</label>
            <input className={inputClass} placeholder="https://…"
              value={(block.props as ImageProps).href}
              onChange={(e) => onChange({ href: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Largeur : {(block.props as ImageProps).width}%</label>
            <input type="range" min={10} max={100} className="w-full"
              value={(block.props as ImageProps).width}
              onChange={(e) => onChange({ width: Number(e.target.value) })} />
          </div>
          <AlignPicker value={(block.props as ImageProps).align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "button" && (
        <>
          <div>
            <label className={labelClass}>Libellé</label>
            <input className={inputClass} value={(block.props as ButtonProps).label}
              onChange={(e) => onChange({ label: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Lien</label>
            <input className={inputClass} placeholder="https://…"
              value={(block.props as ButtonProps).href}
              onChange={(e) => onChange({ href: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fond</label>
              <input type="color" className="border-border h-9 w-full cursor-pointer rounded border"
                value={(block.props as ButtonProps).bgColor}
                onChange={(e) => onChange({ bgColor: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Texte</label>
              <input type="color" className="border-border h-9 w-full cursor-pointer rounded border"
                value={(block.props as ButtonProps).textColor}
                onChange={(e) => onChange({ textColor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Arrondi : {(block.props as ButtonProps).radius}px</label>
            <input type="range" min={0} max={24} className="w-full"
              value={(block.props as ButtonProps).radius}
              onChange={(e) => onChange({ radius: Number(e.target.value) })} />
          </div>
          <AlignPicker value={(block.props as ButtonProps).align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "divider" && (
        <>
          <div>
            <label className={labelClass}>Couleur</label>
            <input type="color" className="border-border h-9 w-full cursor-pointer rounded border"
              value={(block.props as DividerProps).color}
              onChange={(e) => onChange({ color: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Épaisseur : {(block.props as DividerProps).thickness}px</label>
            <input type="range" min={1} max={8} className="w-full"
              value={(block.props as DividerProps).thickness}
              onChange={(e) => onChange({ thickness: Number(e.target.value) })} />
          </div>
        </>
      )}

      {block.type === "spacer" && (
        <div>
          <label className={labelClass}>Hauteur : {(block.props as SpacerProps).height}px</label>
          <input type="range" min={8} max={120} className="w-full"
            value={(block.props as SpacerProps).height}
            onChange={(e) => onChange({ height: Number(e.target.value) })} />
        </div>
      )}
    </div>
  );
}
