"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
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

export const firebaseApp = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp(firebaseConfig);

/** Session sur le projet du CRM, ouverte avec un jeton signé par le serveur (voir /api/auth/crm-token). */
export const getCrmAuth = () => getAuth(firebaseApp);

/**
 * Ouvre la session CRM pour l'utilisateur connecté (compte du projet rapport).
 * Tant que le serveur n'est pas configuré (503), on continue sans session : les règles actuelles le permettent encore.
 */
/** Raison pour laquelle le serveur n'a pas ouvert la session du CRM (affichée dans le bandeau). */
let crmSessionIssue: string | null = null;
export const getCrmSessionIssue = () => crmSessionIssue;

export async function ensureCrmSession(idToken: string, uid: string): Promise<"ok" | "unconfigured" | "denied"> {
  const crmAuth = getCrmAuth();
  await crmAuth.authStateReady();
  if (crmAuth.currentUser?.uid === uid) return "ok";
  const res = await fetch("/api/auth/crm-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 503) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    crmSessionIssue = j.error ?? "Le serveur n'a pas pu ouvrir la session du CRM.";
    syncListeners.forEach((l) => l());
    return "unconfigured";
  }
  crmSessionIssue = null;
  if (!res.ok) return "denied";
  const { token } = (await res.json()) as { token: string };
  await signInWithCustomToken(crmAuth, token);
  return "ok";
}

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

// --- État de la synchronisation (bandeau d'alerte si une écoute est coupée) ---

const syncErrors = new Map<string, string>();
const syncListeners = new Set<() => void>();

function setSyncError(name: string, code: string | null) {
  if ((syncErrors.get(name) ?? null) === code) return;
  if (code) syncErrors.set(name, code);
  else syncErrors.delete(name);
  syncListeners.forEach((l) => l());
}

/** Collections dont l'écoute temps réel est actuellement coupée (nom → code d'erreur). */
export function syncErrorsSnapshot(): Map<string, string> {
  return new Map(syncErrors);
}

export function subscribeSyncErrors(cb: () => void): () => void {
  syncListeners.add(cb);
  return () => {
    syncListeners.delete(cb);
  };
}

export function createCollectionStore<T extends { id: string }>(
  name: string,
): CollectionStore<T> {
  let cache: T[] = [];
  let isReady = false;
  let started = false;
  let unsubscribe: (() => void) | null = null;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  // Écoute temps réel. Firestore coupe définitivement une écoute en erreur (session expirée, refus
  // passager, réseau) : on la relance alors nous-mêmes, sinon la page resterait figée sur sa copie locale.
  function listen() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    unsubscribe?.();
    unsubscribe = onSnapshot(
      collection(db, name),
      (snap) => {
        if (!snap.metadata.fromCache) {
          failures = 0;
          setSyncError(name, null);
        }
        cache = snap.docs.map((d) => d.data() as T);
        isReady = true;
        listeners.forEach((l) => l());
      },
      (err) => {
        console.error(`Firestore [${name}]`, err);
        unsubscribe = null;
        failures += 1;
        setSyncError(name, (err as { code?: string }).code ?? "erreur");
        retryTimer = setTimeout(listen, Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5)));
      },
    );
  }

  function start() {
    if (started) return;
    started = true;
    if (typeof window === "undefined") return;
    // Démarre quand la session CRM est connue, et repart à chaque ouverture de session.
    let lastUid: string | null | undefined;
    onAuthStateChanged(getCrmAuth(), (u) => {
      const uid = u?.uid ?? null;
      if (uid === lastUid && unsubscribe) return;
      lastUid = uid;
      listen();
    });
    // Retour sur l'onglet ou retour du réseau : relance immédiate si l'écoute est coupée.
    const revive = () => {
      if (!unsubscribe && document.visibilityState === "visible") listen();
    };
    document.addEventListener("visibilitychange", revive);
    window.addEventListener("online", revive);
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
