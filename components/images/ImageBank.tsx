"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ImagePlus, Loader2, Search, Trash2, X } from "lucide-react";
import { imageSrc, imageUrl, useImageBank, type ImageMeta } from "@/lib/imageBank";
import { useCrmUser } from "@/lib/rapport";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function filterImages(images: ImageMeta[], query: string, tag: string) {
  const q = norm(query.trim());
  return images.filter(
    (i) => (!tag || i.tags.includes(tag)) && (!q || norm(`${i.name} ${i.description} ${i.tags.join(" ")}`).includes(q)),
  );
}

export function allTags(images: ImageMeta[]) {
  const count = new Map<string, number>();
  for (const i of images) for (const t of i.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Zone de dépôt + bouton : importe et compresse les images dans la banque. */
export function UploadZone({ onUploaded, compact = false }: { onUploaded?: (imgs: ImageMeta[]) => void; compact?: boolean }) {
  const { upload } = useImageBank();
  const { user, name } = useCrmUser();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  const handle = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setError("");
    setBusy({ done: 0, total: list.length });
    const added: ImageMeta[] = [];
    for (const f of list) {
      try {
        added.push(await upload(f, { uid: user?.uid ?? "", name }));
      } catch (e) {
        setError(`${f.name} : ${e instanceof Error ? e.message : "échec"}`);
      }
      setBusy((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBusy(null);
    if (added.length) onUploaded?.(added);
  };

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${compact ? "px-4 py-4" : "px-6 py-8"} ${over ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
      >
        {busy ? (
          <Loader2 className="text-primary h-6 w-6 animate-spin" aria-hidden="true" />
        ) : (
          <ImagePlus className="text-muted-foreground h-6 w-6" aria-hidden="true" />
        )}
        <span className="text-foreground text-sm font-semibold">
          {busy ? `Import ${busy.done}/${busy.total}…` : "Dépose tes images ici ou clique pour choisir"}
        </span>
        {!compact && (
          <span className="text-muted-foreground text-xs">
            JPG, PNG, GIF, WebP · redimensionnées à 1600 px et compressées automatiquement
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void handle(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ImageGrid({
  images,
  onSelect,
  selectedId,
}: {
  images: ImageMeta[];
  onSelect: (img: ImageMeta) => void;
  selectedId?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {images.map((img) => (
        <button
          key={img.id}
          type="button"
          onClick={() => onSelect(img)}
          className={`group bg-card overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${selectedId === img.id ? "border-primary ring-primary/30 ring-4" : "border-border"}`}
        >
          <div className="bg-muted relative aspect-[4/3] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc(img.id)} alt={img.description || img.name} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            {!img.description && (
              <span className="absolute top-2 left-2 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                Sans description
              </span>
            )}
          </div>
          <div className="px-3 py-2">
            <p className="text-foreground truncate text-xs font-semibold">{img.name}</p>
            <p className="text-muted-foreground truncate text-[11px]">
              {img.tags.length ? img.tags.map((t) => `#${t}`).join(" ") : `${img.width}×${img.height}`}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function SearchBar({ query, setQuery, tag, setTag, tags }: { query: string; setQuery: (v: string) => void; tag: string; setTag: (v: string) => void; tags: string[] }) {
  return (
    <div className="space-y-2">
      <div className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2">
        <Search className="text-muted-foreground h-4 w-4" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher par nom, description ou tag…"
          className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
        />
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 20).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? "" : t)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${tag === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function useImageFilter(images: ImageMeta[]) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const tags = useMemo(() => allTags(images), [images]);
  const filtered = useMemo(() => filterImages(images, query, tag), [images, query, tag]);
  return { query, setQuery, tag, setTag, tags, filtered, bar: <SearchBar query={query} setQuery={setQuery} tag={tag} setTag={setTag} tags={tags} /> };
}

/** Fenêtre de choix d'une image (éditeur de modèles d'email). */
export function ImageBankPicker({ onClose, onPick }: { onClose: () => void; onPick: (img: ImageMeta) => void }) {
  const { images, loading } = useImageBank();
  const f = useImageFilter(images);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-lg font-bold">Banque d&apos;images</h2>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1" aria-label="Fermer">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <UploadZone compact onUploaded={(imgs) => imgs.length === 1 && onPick(imgs[0])} />
          {f.bar}
          {loading ? (
            <p className="text-muted-foreground py-10 text-center text-sm">Chargement…</p>
          ) : f.filtered.length ? (
            <ImageGrid images={f.filtered} onSelect={onPick} />
          ) : (
            <p className="text-muted-foreground py-10 text-center text-sm">Aucune image.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Panneau de détail : nom, description pour l'IA, tags, lien public, suppression. */
export function ImageDetail({ img, onClose }: { img: ImageMeta; onClose: () => void }) {
  const { update, remove } = useImageBank();
  const { user, isAdmin } = useCrmUser();
  const [name, setName] = useState(img.name);
  const [description, setDescription] = useState(img.description);
  const [tagInput, setTagInput] = useState(img.tags.join(", "));
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const canDelete = isAdmin || img.uploadedBy === user?.uid;

  const save = (patch: Parameters<typeof update>[1]) => void update(img.id, patch);
  const parseTags = (s: string) =>
    [...new Set(s.split(/[,#\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 15);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="bg-card border-border flex h-full w-full max-w-md flex-col border-l shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <span className="text-muted-foreground text-xs">
            {img.width}×{img.height} · {Math.round(img.size / 1024)} Ko · ajoutée par {img.uploadedByName || "?"}
          </span>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1" aria-label="Fermer">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc(img.id)} alt={description || name} className="bg-muted w-full rounded-lg object-contain" />
          <div>
            <label className="text-muted-foreground mb-1 block text-[11px] font-semibold uppercase">Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== img.name && save({ name: name.trim() })}
              className="border-border bg-card w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-[11px] font-semibold uppercase">Description (lue par l&apos;IA)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== img.description && save({ description: description.trim() })}
              rows={3}
              placeholder="Ex : gant Impact noir porté par un policier en intervention, fond sombre, idéal en bannière"
              className="border-border bg-card w-full resize-y rounded-lg border px-3 py-2 text-sm"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">Plus elle est précise, mieux l&apos;IA choisira cette image pour tes emails.</p>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-[11px] font-semibold uppercase">Tags</label>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onBlur={() => save({ tags: parseTags(tagInput) })}
              placeholder="produit, impact, bannière, salon…"
              className="border-border bg-card w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-[11px] font-semibold uppercase">Lien public</label>
            <div className="flex gap-2">
              <input readOnly value={imageUrl(img.id)} className="border-border bg-muted min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs" />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(imageUrl(img.id));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="border-border hover:bg-muted inline-flex items-center gap-1 rounded-lg border px-3 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          </div>
        </div>
        {canDelete && (
          <div className="border-border flex justify-end border-t px-5 py-3">
            {confirm ? (
              <button
                type="button"
                onClick={async () => {
                  await remove(img.id);
                  onClose();
                }}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Confirmer : les emails qui l&apos;utilisent ne l&apos;afficheront plus
              </button>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="text-muted-foreground inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Supprimer
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
