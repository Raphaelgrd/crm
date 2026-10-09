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

// --- Meta (Facebook + Instagram) integration ---

export interface MetaConfig {
  pageToken: string;    // permanent page access token
  pageId: string;
  pageName?: string;
  igAccountId?: string; // linked Instagram Business/Creator account
  igUsername?: string;
}

const META_CONFIG_KEY = "netforce.meta.config";

export function loadMetaConfig(): MetaConfig | null {
  try {
    const raw = localStorage.getItem(META_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as MetaConfig) : null;
  } catch { return null; }
}

export function saveMetaConfig(config: MetaConfig): void {
  try { localStorage.setItem(META_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

export function clearMetaConfig(): void {
  try { localStorage.removeItem(META_CONFIG_KEY); } catch {}
}

export interface FacebookStats { pageName: string; followers: number; likes: number }
export interface InstagramStats { username: string; followers: number; mediaCount: number }

async function graphFetch<T>(path: string, token: string, fields: string): Promise<T> {
  const url = `https://graph.facebook.com/v21.0/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json() as T & { error?: { message: string } };
  if (!res.ok || (data as { error?: { message: string } }).error) {
    throw new Error(((data as { error?: { message: string } }).error?.message) ?? `Graph API error (${res.status})`);
  }
  return data;
}

export async function fetchFacebookStats(config: MetaConfig): Promise<FacebookStats> {
  const data = await graphFetch<{ name: string; followers_count: number; fan_count: number }>(
    config.pageId, config.pageToken, "name,followers_count,fan_count",
  );
  return { pageName: data.name, followers: data.followers_count ?? data.fan_count ?? 0, likes: data.fan_count ?? 0 };
}

export async function detectInstagramAccount(config: MetaConfig): Promise<{ id: string; username: string; followers: number; mediaCount: number } | null> {
  try {
    const pageData = await graphFetch<{ instagram_business_account?: { id: string } }>(
      config.pageId, config.pageToken, "instagram_business_account",
    );
    const igId = pageData.instagram_business_account?.id;
    if (!igId) return null;
    const igData = await graphFetch<{ username: string; followers_count: number; media_count: number }>(
      igId, config.pageToken, "username,followers_count,media_count",
    );
    return { id: igId, username: igData.username, followers: igData.followers_count ?? 0, mediaCount: igData.media_count ?? 0 };
  } catch { return null; }
}

export async function fetchInstagramStats(config: MetaConfig): Promise<InstagramStats> {
  if (!config.igAccountId) throw new Error("Aucun compte Instagram lié à cette page.");
  const data = await graphFetch<{ username: string; followers_count: number; media_count: number }>(
    config.igAccountId, config.pageToken, "username,followers_count,media_count",
  );
  return { username: data.username, followers: data.followers_count ?? 0, mediaCount: data.media_count ?? 0 };
}

// --- YouTube integration ---

export interface YouTubeConfig {
  apiKey: string;
  channelInput: string; // @handle, channel ID (UC...), or username
  channelTitle?: string;
}

const YT_CONFIG_KEY = "netforce.youtube.config";

export function loadYouTubeConfig(): YouTubeConfig | null {
  try {
    const raw = localStorage.getItem(YT_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as YouTubeConfig) : null;
  } catch { return null; }
}

export function saveYouTubeConfig(config: YouTubeConfig): void {
  try { localStorage.setItem(YT_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

export function clearYouTubeConfig(): void {
  try { localStorage.removeItem(YT_CONFIG_KEY); } catch {}
}

export interface YouTubeStats {
  channelTitle: string;
  subscribers: number;
  videos: number;
  views: number;
}

export async function fetchYouTubeStats(config: YouTubeConfig): Promise<YouTubeStats> {
  const params = new URLSearchParams({ part: "statistics,snippet", key: config.apiKey });
  const input = config.channelInput.trim();
  if (input.startsWith("UC")) params.set("id", input);
  else if (input.startsWith("@")) params.set("forHandle", input);
  else params.set("forUsername", input);

  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Erreur YouTube API (${res.status})`);
  }
  const data = await res.json() as {
    items?: Array<{
      snippet: { title: string };
      statistics: { subscriberCount: string; videoCount: string; viewCount: string };
    }>;
  };
  if (!data.items?.length) throw new Error("Chaîne introuvable. Vérifie le handle ou l'ID.");
  const item = data.items[0];
  return {
    channelTitle: item.snippet.title,
    subscribers: parseInt(item.statistics.subscriberCount, 10) || 0,
    videos: parseInt(item.statistics.videoCount, 10) || 0,
    views: parseInt(item.statistics.viewCount, 10) || 0,
  };
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
