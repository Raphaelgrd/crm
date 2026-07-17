"use client";

import { getApps, initializeApp } from "firebase/app";
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

// Les clés du SDK web sont publiques par conception : la sécurité se fait via
// les règles Firestore, pas via ces valeurs (.env.local).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);

let firestore: Firestore;
try {
  // Cache local persistant : l'appli reste utilisable hors-ligne et les
  // lectures sont instantanées, Firestore synchronise en arrière-plan.
  firestore = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  firestore = initializeFirestore(firebaseApp, {});
}
export const db = firestore;

/** Firestore refuse `undefined` : on nettoie les objets avant écriture. */
export function sanitize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Petit store temps réel au-dessus d'une collection Firestore.
 * - `get()` : lecture synchrone du cache (même rôle que l'ancien load())
 * - `subscribe()` : démarre l'écoute temps réel et notifie à chaque changement
 * - écritures optimistes : onSnapshot répercute localement avant le réseau
 */
export interface CollectionStore<T extends { id: string }> {
  get: () => T[];
  ready: () => boolean;
  subscribe: (cb: () => void) => () => void;
  set: (item: T) => Promise<void>;
  setMany: (items: T[]) => Promise<void>;
  update: (id: string, patch: Record<string, unknown>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function createCollectionStore<T extends { id: string }>(
  name: string,
): CollectionStore<T> {
  let cache: T[] = [];
  let isReady = false;
  let started = false;
  const listeners = new Set<() => void>();

  function start() {
    if (started) return;
    started = true;
    onSnapshot(
      collection(db, name),
      (snap) => {
        cache = snap.docs.map((d) => d.data() as T);
        isReady = true;
        listeners.forEach((l) => l());
      },
      (err) => {
        console.error(`Firestore [${name}]`, err);
      },
    );
  }

  return {
    get: () => cache,
    ready: () => isReady,
    subscribe(cb) {
      start();
      listeners.add(cb);
      if (isReady) cb();
      return () => {
        listeners.delete(cb);
      };
    },
    async set(item) {
      start();
      await setDoc(doc(db, name, item.id), sanitize(item));
    },
    async setMany(items) {
      start();
      // writeBatch est limité à 500 opérations : on découpe.
      for (let i = 0; i < items.length; i += 400) {
        const batch = writeBatch(db);
        for (const item of items.slice(i, i + 400)) {
          batch.set(doc(db, name, item.id), sanitize(item));
        }
        await batch.commit();
      }
    },
    async update(id, patch) {
      start();
      await updateDoc(doc(db, name, id), sanitize(patch));
    },
    async remove(id) {
      await deleteDoc(doc(db, name, id));
    },
  };
}
