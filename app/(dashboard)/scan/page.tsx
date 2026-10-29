"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, CircleAlert, ImagePlus, Loader2, RefreshCw, ScanLine, Trash2, UserPlus } from "lucide-react";
import { DEFAULT_CATEGORIES, STAGES, useContacts, type Contact, type ContactInput } from "@/lib/contacts";
import { logActivity } from "@/lib/activities";
import { authFetch } from "@/lib/rapport";
import { compressImage } from "@/lib/imageBank";
import { dayKey } from "@/lib/todos";
import { CameraScanner } from "@/components/scan/CameraScanner";

interface CardData {
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  address: string;
  country: string;
  linkedin: string;
  otherInfo: string;
  suggestedCategory: string;
  uncertain: string[];
}

type Status = "pending" | "reading" | "ready" | "error" | "saved";

interface ScannedCard {
  id: string;
  images: string[];
  status: Status;
  error?: string;
  data?: CardData;
  category: string;
  stage: string;
  followUp: boolean;
  savedContactId?: string;
}

const inputClass =
  "border-border bg-card text-foreground focus:border-primary/50 w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none";

const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function findDuplicate(d: CardData, contacts: Contact[]): Contact | undefined {
  const email = d.email.toLowerCase();
  const phones = [d.phone, d.mobile].map(digits).filter((p) => p.length >= 8);
  return contacts.find(
    (c) =>
      (email && c.email.toLowerCase() === email) ||
      (phones.length && phones.includes(digits(c.phone || ""))) ||
      (d.lastName && norm(c.lastName) === norm(d.lastName) && norm(c.firstName) === norm(d.firstName) && (!d.company || norm(c.company) === norm(d.company))),
  );
}

const fileToDataUrl = async (file: File) => {
  const { blob } = await compressImage(file);
  return new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(blob);
  });
};

const makeId = () => Math.random().toString(36).slice(2, 10);

export default function ScanPage() {
  const { contacts, addContact, updateContact } = useContacts();
  const [cards, setCards] = useState<ScannedCard[]>([]);
  const [camera, setCamera] = useState<{ open: boolean; backFor?: string }>({ open: false });
  const [event, setEvent] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const busy = useRef(false);

  const patch = (id: string, p: Partial<ScannedCard>) => setCards((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const patchData = (id: string, p: Partial<CardData>) =>
    setCards((l) => l.map((c) => (c.id === id && c.data ? { ...c, data: { ...c.data, ...p } } : c)));

  const addImages = (dataUrls: string[]) =>
    setCards((l) => [
      ...dataUrls.map((u) => ({ id: makeId(), images: [u], status: "pending" as Status, category: "Prospect", stage: "Nouveau", followUp: true })),
      ...l,
    ]);

  // Lecture une par une, pour ménager les limites des IA gratuites.
  useEffect(() => {
    if (busy.current) return;
    const next = [...cards].reverse().find((c) => c.status === "pending");
    if (!next) return;
    busy.current = true;
    patch(next.id, { status: "reading", error: undefined });
    authFetch("/api/ai/business-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: next.images }),
    })
      .then(async (res) => {
        const out = (await res.json()) as { card?: CardData; error?: string };
        if (!res.ok || !out.card) throw new Error(out.error ?? "Lecture impossible.");
        patch(next.id, { status: "ready", data: out.card, category: out.card.suggestedCategory || "Prospect" });
      })
      .catch((e: unknown) => patch(next.id, { status: "error", error: e instanceof Error ? e.message : "Lecture impossible." }))
      .finally(() => {
        busy.current = false;
        setCards((l) => [...l]);
      });
  }, [cards]);

  const toInput = (c: ScannedCard): ContactInput => {
    const d = c.data!;
    const extra: Record<string, string> = {};
    if (d.jobTitle) extra["Poste"] = d.jobTitle;
    if (d.mobile && d.phone) extra["Mobile"] = d.mobile;
    if (d.website) extra["Site web"] = d.website;
    if (d.address) extra["Adresse"] = d.address;
    if (d.linkedin) extra["LinkedIn"] = d.linkedin;
    const notes = [`Carte de visite scannée le ${new Date().toLocaleDateString("fr-FR")}${event ? ` (${event})` : ""}.`, d.otherInfo].filter(Boolean).join("\n");
    return {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone || d.mobile,
      company: d.company,
      category: c.category,
      stage: c.stage as ContactInput["stage"],
      notes,
      tags: ["Carte de visite", ...(event ? [event] : [])],
      extra,
      ...(d.country ? { country: d.country } : {}),
      ...(c.followUp ? { nextFollowUpAt: dayKey(3) } : {}),
    };
  };

  const save = async (c: ScannedCard, mode: "create" | "merge") => {
    if (!c.data) return;
    const input = toInput(c);
    const dup = findDuplicate(c.data, contacts);
    if (mode === "merge" && dup) {
      const fill: Partial<ContactInput> = {};
      (["firstName", "lastName", "email", "phone", "company", "country"] as const).forEach((k) => {
        if (!dup[k] && input[k]) (fill as Record<string, unknown>)[k] = input[k];
      });
      fill.tags = [...new Set([...(dup.tags ?? []), ...(input.tags ?? [])])];
      fill.extra = { ...(input.extra ?? {}), ...(dup.extra ?? {}) };
      if (c.followUp && !dup.nextFollowUpAt) fill.nextFollowUpAt = input.nextFollowUpAt;
      await updateContact(dup.id, fill);
      await logActivity({ contactId: dup.id, type: "note", text: input.notes, auto: true });
      patch(c.id, { status: "saved", savedContactId: dup.id });
    } else {
      const created = await addContact(input);
      await logActivity({ contactId: created.id, type: "note", text: input.notes, auto: true });
      patch(c.id, { status: "saved", savedContactId: created.id });
    }
  };

  const readyCards = cards.filter((c) => c.status === "ready");
  const saveAll = async () => {
    setSavingAll(true);
    try {
      for (const c of readyCards) await save(c, findDuplicate(c.data!, contacts) ? "merge" : "create");
    } finally {
      setSavingAll(false);
    }
  };

  const counts = useMemo(
    () => ({
      reading: cards.filter((c) => c.status === "pending" || c.status === "reading").length,
      ready: readyCards.length,
      saved: cards.filter((c) => c.status === "saved").length,
    }),
    [cards, readyCards.length],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
          <ScanLine className="h-6 w-6 text-violet-600" aria-hidden="true" />
          Scanner des cartes de visite
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Photographie ou importe des cartes : l&apos;IA remplit la fiche, tu vérifies, un clic crée le contact.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setCamera({ open: true })}
          className="flex items-center justify-center gap-3 rounded-xl bg-violet-600 px-5 py-5 text-left text-white shadow-sm transition-colors hover:bg-violet-700"
        >
          <Camera className="h-7 w-7 shrink-0" aria-hidden="true" />
          <span>
            <span className="block font-bold">Scanner avec la caméra</span>
            <span className="block text-xs text-white/80">Enchaîne les cartes, idéal sur un salon</span>
          </span>
        </button>
        <label className="border-border bg-card hover:bg-muted flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-5 text-left transition-colors">
          <ImagePlus className="text-muted-foreground h-7 w-7 shrink-0" aria-hidden="true" />
          <span>
            <span className="text-foreground block font-bold">Importer des photos ou des scans</span>
            <span className="text-muted-foreground block text-xs">JPG, PNG, HEIC… une image par carte, plusieurs à la fois</span>
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              addImages(await Promise.all(files.map(fileToDataUrl)));
            }}
          />
        </label>
      </div>

      <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
        <label className="text-foreground text-sm font-medium" htmlFor="event">
          Événement / salon
        </label>
        <input
          id="event"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          placeholder="ex : Milipol 2026 (ajouté en tag et en note)"
          className={`${inputClass} max-w-xs flex-1`}
        />
        {cards.length > 0 && (
          <span className="text-muted-foreground ml-auto text-xs">
            {counts.reading > 0 && `${counts.reading} en lecture · `}
            {counts.ready} à vérifier · {counts.saved} enregistrée{counts.saved > 1 ? "s" : ""}
          </span>
        )}
        {counts.ready > 1 && (
          <button
            type="button"
            disabled={savingAll}
            onClick={() => void saveAll()}
            className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {savingAll ? "Enregistrement…" : `Tout valider (${counts.ready})`}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {cards.map((c) => (
          <CardReview
            key={c.id}
            card={c}
            duplicate={c.data && c.status === "ready" ? findDuplicate(c.data, contacts) : undefined}
            onPatch={(p) => patch(c.id, p)}
            onPatchData={(p) => patchData(c.id, p)}
            onSave={(mode) => save(c, mode)}
            onRetry={() => patch(c.id, { status: "pending" })}
            onAddBack={() => setCamera({ open: true, backFor: c.id })}
            onRemove={() => setCards((l) => l.filter((x) => x.id !== c.id))}
          />
        ))}
        {!cards.length && (
          <div className="border-border rounded-xl border border-dashed py-14 text-center">
            <p className="text-foreground text-sm font-semibold">Aucune carte pour l&apos;instant</p>
            <p className="text-muted-foreground mt-1 text-sm">Scanne ou importe une carte pour commencer.</p>
          </div>
        )}
      </div>

      {camera.open && (
        <CameraScanner
          onClose={() => setCamera({ open: false })}
          onCapture={(url) => {
            if (camera.backFor) {
              const id = camera.backFor;
              setCards((l) => l.map((x) => (x.id === id ? { ...x, images: [x.images[0], url], status: "pending" } : x)));
              setCamera({ open: false });
            } else {
              addImages([url]);
            }
          }}
        />
      )}
    </div>
  );
}

const FIELDS: { key: keyof CardData; label: string; wide?: boolean }[] = [
  { key: "firstName", label: "Prénom" },
  { key: "lastName", label: "Nom" },
  { key: "jobTitle", label: "Poste" },
  { key: "company", label: "Société / organisation" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
  { key: "mobile", label: "Mobile" },
  { key: "country", label: "Pays" },
  { key: "website", label: "Site web" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "address", label: "Adresse", wide: true },
  { key: "otherInfo", label: "Autres infos", wide: true },
];

function CardReview({
  card,
  duplicate,
  onPatch,
  onPatchData,
  onSave,
  onRetry,
  onAddBack,
  onRemove,
}: {
  card: ScannedCard;
  duplicate?: Contact;
  onPatch: (p: Partial<ScannedCard>) => void;
  onPatchData: (p: Partial<CardData>) => void;
  onSave: (mode: "create" | "merge") => Promise<void>;
  onRetry: () => void;
  onAddBack: () => void;
  onRemove: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const d = card.data;
  const run = async (mode: "create" | "merge") => {
    setSaving(true);
    try {
      await onSave(mode);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`border-border bg-card overflow-hidden rounded-xl border shadow-sm ${card.status === "saved" ? "opacity-70" : ""}`}>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          {card.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={i ? "Verso de la carte" : "Carte de visite"} className="border-border w-full rounded-lg border object-contain" />
          ))}
          {card.status !== "saved" && card.images.length === 1 && (
            <button type="button" onClick={onAddBack} className="text-muted-foreground hover:text-foreground text-xs underline">
              + Ajouter le verso
            </button>
          )}
        </div>

        <div className="min-w-0">
          {(card.status === "pending" || card.status === "reading") && (
            <p className="text-muted-foreground flex h-full items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {card.status === "reading" ? "Lecture de la carte…" : "En attente…"}
            </p>
          )}

          {card.status === "error" && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-red-600">
                <CircleAlert className="h-4 w-4" aria-hidden="true" />
                {card.error}
              </p>
              <button type="button" onClick={onRetry} className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
              </button>
            </div>
          )}

          {card.status === "saved" && (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <Check className="h-4 w-4" aria-hidden="true" />
              {d?.firstName} {d?.lastName} enregistré dans les contacts
            </p>
          )}

          {card.status === "ready" && d && (
            <div className="space-y-3">
              {duplicate && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Contact déjà présent : <strong>{duplicate.firstName} {duplicate.lastName}</strong>
                  {duplicate.company ? ` (${duplicate.company})` : ""}. Tu peux compléter sa fiche plutôt que créer un doublon.
                </p>
              )}
              {d.uncertain.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">À vérifier : champs encadrés en orange (lecture incertaine).</p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
                    <span className="text-muted-foreground mb-0.5 block text-[11px] font-semibold uppercase">{f.label}</span>
                    <input
                      value={String(d[f.key] ?? "")}
                      onChange={(e) => onPatchData({ [f.key]: e.target.value } as Partial<CardData>)}
                      className={`${inputClass} ${d.uncertain.includes(f.key) ? "border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900" : ""}`}
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label>
                  <span className="text-muted-foreground mb-0.5 block text-[11px] font-semibold uppercase">Catégorie</span>
                  <select value={card.category} onChange={(e) => onPatch({ category: e.target.value })} className={inputClass}>
                    {DEFAULT_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-muted-foreground mb-0.5 block text-[11px] font-semibold uppercase">Étape</span>
                  <select value={card.stage} onChange={(e) => onPatch({ stage: e.target.value })} className={inputClass}>
                    {STAGES.map((s) => (
                      <option key={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-foreground flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={card.followUp} onChange={(e) => onPatch({ followUp: e.target.checked })} />
                  Relancer dans 3 jours
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {duplicate ? (
                  <>
                    <button type="button" disabled={saving} onClick={() => void run("merge")} className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                      Compléter la fiche existante
                    </button>
                    <button type="button" disabled={saving} onClick={() => void run("create")} className="border-border hover:bg-muted rounded-lg border px-3 py-2 text-sm">
                      Créer quand même
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={saving || !(d.firstName || d.lastName || d.email)}
                    onClick={() => void run("create")}
                    className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {saving ? "Création…" : "Créer le contact"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {card.status !== "saved" && card.status !== "reading" && (
        <div className="border-border flex justify-end border-t px-4 py-2">
          <button type="button" onClick={onRemove} className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:text-rose-600">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Retirer
          </button>
        </div>
      )}
    </div>
  );
}
