import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { Bytes, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore/lite";
import { crmAdminApp } from "./admin";
import { crmDb } from "./db";

// Accès serveur aux collections du CRM. Avec le compte de service (FIREBASE_SERVICE_ACCOUNT_CRM),
// accès administrateur, indépendant des règles Firestore ; sinon, session du serveur (crmDb).

export type Data = Record<string, unknown>;

/** Accès minimal aux collections, quel que soit le mode de connexion. */
export interface Store {
  get(col: string, id: string): Promise<Data | null>;
  set(col: string, id: string, data: Data): Promise<void>;
  update(col: string, id: string, data: Data): Promise<void>;
  remove(col: string, id: string): Promise<void>;
  list(col: string): Promise<Data[]>;
  bytes(u8: Uint8Array): unknown;
}

export async function store(): Promise<Store> {
  const admin = crmAdminApp();
  if (admin) {
    const fs = getAdminFirestore(admin);
    return {
      get: async (c, id) => (await fs.collection(c).doc(id).get()).data() ?? null,
      set: async (c, id, d) => void (await fs.collection(c).doc(id).set(d)),
      update: async (c, id, d) => void (await fs.collection(c).doc(id).update(d)),
      remove: async (c, id) => void (await fs.collection(c).doc(id).delete()),
      list: async (c) => (await fs.collection(c).get()).docs.map((d) => d.data()),
      bytes: (u8) => Buffer.from(u8),
    };
  }
  const db = await crmDb();
  return {
    get: async (c, id) => {
      const s = await getDoc(doc(db, c, id));
      return s.exists() ? s.data() : null;
    },
    set: (c, id, d) => setDoc(doc(db, c, id), d),
    update: (c, id, d) => updateDoc(doc(db, c, id), d),
    remove: (c, id) => deleteDoc(doc(db, c, id)),
    list: async (c) => (await getDocs(collection(db, c))).docs.map((d) => d.data()),
    bytes: (u8) => Bytes.fromUint8Array(u8),
  };
}

