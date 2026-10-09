"use client";

import { useMemo, useState } from "react";
import { X, ScanSearch, GitMerge, Flag } from "lucide-react";
import { Contact, StageName, contactFullName, useContacts } from "@/lib/contacts";

interface Props {
  open: boolean;
  contacts: Contact[];
  onClose: () => void;
}

interface DupGroup {
  key: string;
  reason: string;
  contacts: Contact[];
}

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(s: string) {
  return s.replace(/[\s\-.()+]/g, "").replace(/^0/, "33");
}

function detectDuplicates(contacts: Contact[]): DupGroup[] {
  const emailGroups = new Map<string, Contact[]>();
  const phoneGroups = new Map<string, Contact[]>();

  for (const c of contacts) {
    if (c.stage === "Doublon") continue;
    const email = normalize(c.email);
    if (email) {
      const list = emailGroups.get(email) ?? [];
      list.push(c);
      emailGroups.set(email, list);
    }
    const phone = normalizePhone(c.phone);
    if (phone.length >= 8) {
      const list = phoneGroups.get(phone) ?? [];
      list.push(c);
      phoneGroups.set(phone, list);
    }
  }

  const groups: DupGroup[] = [];
  const seen = new Set<string>();

  for (const [email, list] of emailGroups) {
    if (list.length < 2) continue;
    const key = `email:${email}`;
    groups.push({ key, reason: `Email identique : ${email}`, contacts: list });
    for (const c of list) seen.add(c.id);
  }

  for (const [phone, list] of phoneGroups) {
    if (list.length < 2) continue;
    const ids = list.map((c) => c.id);
    if (ids.some((id) => seen.has(id))) continue;
    groups.push({ key: `phone:${phone}`, reason: `Téléphone identique : ${list[0].phone}`, contacts: list });
  }

  return groups;
}

export default function DuplicatesModal({ open, contacts, onClose }: Props) {
  const { updateContact, deleteContact } = useContacts();
  const [processing, setProcessing] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const groups = useMemo(() => detectDuplicates(contacts), [contacts]);
  const activeGroups = groups.filter((g) => !done.has(g.key));

  const markAllAsDuplicate = async (group: DupGroup) => {
    setProcessing(group.key);
    const [keep, ...dupes] = group.contacts;
    void keep;
    for (const c of dupes) {
      await updateContact(c.id, { stage: "Doublon" as StageName });
    }
    setProcessing(null);
    setDone((prev) => new Set([...prev, group.key]));
  };

  const mergeKeepFirst = async (group: DupGroup) => {
    setProcessing(group.key);
    const [primary, ...others] = group.contacts;
    const mergedNotes = [primary.notes, ...others.map((c) => c.notes)]
      .filter(Boolean)
      .join("\n\n---\n\n");
    const mergedTags = Array.from(new Set([...(primary.tags ?? []), ...others.flatMap((c) => c.tags ?? [])]));
    const mergedExtra: Record<string, string> = {};
    for (const c of [...others, primary]) {
      Object.assign(mergedExtra, c.extra ?? {});
    }
    await updateContact(primary.id, { notes: mergedNotes, tags: mergedTags, extra: mergedExtra });
    for (const c of others) {
      await deleteContact(c.id);
    }
    setProcessing(null);
    setDone((prev) => new Set([...prev, group.key]));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <ScanSearch className="text-primary h-5 w-5" aria-hidden="true" />
            <h2 className="text-foreground text-lg font-bold">Détection des doublons</h2>
          </div>
          <button type="button" onClick={onClose} className="hover:bg-muted rounded p-1 transition-colors">
            <X className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {activeGroups.length === 0 ? (
            <div className="py-12 text-center">
              <ScanSearch className="mx-auto h-10 w-10 text-gray-200" aria-hidden="true" />
              <p className="text-foreground mt-3 text-sm font-semibold">
                {groups.length === 0 ? "Aucun doublon détecté" : "Tous les doublons ont été traités"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {groups.length === 0
                  ? "Les emails et téléphones sont tous uniques dans la base."
                  : `${groups.length} groupe${groups.length > 1 ? "s" : ""} traité${groups.length > 1 ? "s" : ""}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground text-xs">
                {activeGroups.length} groupe{activeGroups.length > 1 ? "s" : ""} de doublons détecté
                {activeGroups.length > 1 ? "s" : ""} (par email ou téléphone).
              </p>
              {activeGroups.map((group) => (
                <div key={group.key} className="border-border rounded-xl border p-4">
                  <p className="text-muted-foreground mb-3 text-xs font-medium">{group.reason}</p>
                  <div className="mb-3 divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                    {group.contacts.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          {i === 0 ? "★" : i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground text-sm font-medium">{contactFullName(c) || "—"}</p>
                          <p className="text-muted-foreground text-xs">{c.email || c.phone} · {c.category || "—"}</p>
                        </div>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(c.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-2 text-[10px]">
                    ★ = fiche conservée comme référence
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={processing === group.key}
                      onClick={() => void mergeKeepFirst(group)}
                      className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                      Fusionner (garder ★, supprimer les autres)
                    </button>
                    <button
                      type="button"
                      disabled={processing === group.key}
                      onClick={() => void markAllAsDuplicate(group)}
                      className="border-border bg-card text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      Marquer les autres comme Doublon
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-border border-t px-6 py-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
