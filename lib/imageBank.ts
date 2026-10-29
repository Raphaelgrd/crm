"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { createCollectionStore, db } from "@/lib/firebase";

// Banque d'images : métadonnées dans "image_bank", contenu (base64) dans "image_blobs".
// Les images sont servies publiquement par /api/images/<id>, utilisable dans les emails.

export interface ImageMeta {
  id: string;
  name: string;
  /** Description lue par l'IA pour choisir les images (contenu, usage, ambiance). */
  description: string;
  tags: string[];
  mime: string;
  width: number;
  height: number;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
}

const store = createCollectionStore<ImageMeta>("image_bank");

/** Limite d'un document Firestore (1 Mo) moins la marge du base64. */
const MAX_BYTES = 700_000;
const MAX_SIDE = 1600;

export const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com";

export function imageUrl(id: string): string {
  return `${PUBLIC_APP_URL}/api/images/${id}`;
}

/** URL relative pour l'affichage dans le CRM (fonctionne aussi en local). */
export const imageSrc = (id: string) => `/api/images/${id}`;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    img.src = url;
  });
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4 * 16) if (data[i] < 250) return true;
  return false;
}

const blobOf = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Compression impossible."))), type, quality));

/** Redimensionne (1600 px max) et compresse sous ~700 Ko : PNG si transparence, sinon JPEG (le mieux supporté par les clients mail). */
export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  for (let attempt = 0; attempt < 6; attempt++) {
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    if (hasAlpha(ctx, width, height)) {
      const png = await blobOf(canvas, "image/png");
      if (png.size <= MAX_BYTES) return { blob: png, width, height };
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    for (const q of [0.86, 0.75, 0.62]) {
      const jpg = await blobOf(canvas, "image/jpeg", q);
      if (jpg.size <= MAX_BYTES) return { blob: jpg, width, height };
    }
    scale *= 0.75;
  }
  throw new Error("Image trop lourde, même compressée.");
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(new Error("Lecture impossible."));
    r.readAsDataURL(blob);
  });

const makeId = () => `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function prettyName(fileName: string) {
  return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
}

export function useImageBank() {
  const [images, setImages] = useState<ImageMeta[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setImages([...store.get()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setLoading(false);
      }),
    [],
  );

  const upload = useCallback(
    async (file: File, by: { uid: string; name: string }, extra: Partial<Pick<ImageMeta, "description" | "tags">> = {}) => {
      if (!file.type.startsWith("image/")) throw new Error(`${file.name} n'est pas une image.`);
      const { blob, width, height } = await compressImage(file);
      const id = makeId();
      const t = new Date().toISOString();
      await setDoc(doc(db, "image_blobs", id), { id, mime: blob.type, data: await toBase64(blob) });
      const meta: ImageMeta = {
        id,
        name: prettyName(file.name),
        description: extra.description ?? "",
        tags: extra.tags ?? [],
        mime: blob.type,
        width,
        height,
        size: blob.size,
        uploadedBy: by.uid,
        uploadedByName: by.name,
        createdAt: t,
        updatedAt: t,
      };
      await store.set(meta);
      return meta;
    },
    [],
  );

  const update = useCallback(async (id: string, patch: Partial<Pick<ImageMeta, "name" | "description" | "tags">>) => {
    await store.update(id, { ...patch, updatedAt: new Date().toISOString() });
  }, []);

  const remove = useCallback(async (id: string) => {
    await Promise.all([store.remove(id), deleteDoc(doc(db, "image_blobs", id))]);
  }, []);

  return { images, loading, upload, update, remove };
}
