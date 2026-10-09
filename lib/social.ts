"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

export type SocialPlatform =
  | "Instagram"
  | "LinkedIn"
  | "TikTok"
  | "YouTube"
  | "Twitter"
  | "Facebook";

export const PLATFORMS: {
  name: SocialPlatform;
  color: string;
  textColor: string;
  gradient: string;
}[] = [
  { name: "Instagram", color: "#E1306C", textColor: "text-pink-500", gradient: "from-pink-500 via-rose-500 to-orange-400" },
  { name: "LinkedIn", color: "#0A66C2", textColor: "text-blue-600", gradient: "from-blue-600 to-blue-700" },
  { name: "TikTok", color: "#010101", textColor: "text-gray-800 dark:text-gray-200", gradient: "from-gray-800 to-gray-900" },
  { name: "YouTube", color: "#FF0000", textColor: "text-red-500", gradient: "from-red-500 to-red-600" },
  { name: "Twitter", color: "#1DA1F2", textColor: "text-sky-500", gradient: "from-sky-400 to-sky-500" },
  { name: "Facebook", color: "#1877F2", textColor: "text-blue-500", gradient: "from-blue-500 to-blue-600" },
];

export interface SocialSnapshot {
  id: string;
  platform: SocialPlatform;
  followers: number;
  posts: number;
  views: number;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export type SocialSnapshotInput = Omit<SocialSnapshot, "id" | "createdAt" | "updatedAt">;

const store = createCollectionStore<SocialSnapshot>("socialSnapshots");

function makeId() {
  return `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sorted(list: SocialSnapshot[]): SocialSnapshot[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

export function useSocial() {
  const [snapshots, setSnapshots] = useState<SocialSnapshot[]>(sorted(store.get()));
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setSnapshots(sorted(store.get()));
        setLoading(false);
      }),
    [],
  );

  const addSnapshot = useCallback(async (input: SocialSnapshotInput): Promise<SocialSnapshot> => {
    const now = new Date().toISOString();
    const snap: SocialSnapshot = { ...input, id: makeId(), createdAt: now, updatedAt: now };
    await store.set(snap);
    return snap;
  }, []);

  const deleteSnapshot = useCallback(async (id: string): Promise<void> => {
    await store.remove(id);
  }, []);

  /** Latest snapshot per platform (sorted by date desc, so first is latest). */
  const latestByPlatform = (platform: SocialPlatform): SocialSnapshot | undefined =>
    snapshots.find((s) => s.platform === platform);

  /** All snapshots for a platform, chronological order for charts. */
  const historyByPlatform = (platform: SocialPlatform): SocialSnapshot[] =>
    snapshots.filter((s) => s.platform === platform).reverse();

  return { snapshots, loading, addSnapshot, deleteSnapshot, latestByPlatform, historyByPlatform };
}
