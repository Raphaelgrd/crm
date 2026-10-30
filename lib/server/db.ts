import { createHmac } from "node:crypto";
import { getApps, initializeApp } from "firebase/app";
import {
  Auth,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { crmAdminApp } from "./admin";
import { Firestore, connectFirestoreEmulator, doc, getFirestore, setDoc } from "firebase/firestore/lite";

const CRM_APP = "server-crm";
let crmSignIn: Promise<void> | null = null;

/** Base du CRM pour les routes serveur, avec une session « serveur » quand le compte de service est configuré. */
export async function crmDb(): Promise<Firestore> {
  const app =
    getApps().find((a) => a.name === CRM_APP) ??
    initializeApp(
      {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      },
      CRM_APP,
    );
  // Tests en local uniquement : base de l'émulateur Firestore (variable jamais définie sur Vercel).
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    const [host, port] = emulator.split(":");
    try {
      connectFirestoreEmulator(getFirestore(app), host, Number(port));
    } catch {}
    return getFirestore(app);
  }
  const admin = crmAdminApp();
  const auth = getAuth(app);
  if (admin && !auth.currentUser) {
    crmSignIn ??= getAdminAuth(admin)
      .createCustomToken("crm-server", { crm: true, admin: true, server: true })
      .then((t) => signInWithCustomToken(auth, t))
      .then(() => undefined)
      .finally(() => {
        crmSignIn = null;
      });
    await crmSignIn;
  }
  return getFirestore(app);
}

const RAPPORT_APP = "server-rapport";
const rapportConfig = {
  apiKey: "AIzaSyABOcipg9S2LNSx-MBYa66xYBJA2E2MYdM",
  authDomain: "netforce-38edf.firebaseapp.com",
  projectId: "netforce-38edf",
  storageBucket: "netforce-38edf.firebasestorage.app",
  messagingSenderId: "562828872246",
  appId: "1:562828872246:web:09b24b68e4c879f182a697",
};

// Le compte de l'Assistant IA est dérivé de CRM_API_KEY : une nouvelle clé crée un nouveau compte,
// qu'un admin doit autoriser dans Paramètres → Équipe et accès.
function botCredentials(): { email: string; password: string } | null {
  if (process.env.RAPPORT_BOT_EMAIL && process.env.RAPPORT_BOT_PASSWORD) {
    return { email: process.env.RAPPORT_BOT_EMAIL, password: process.env.RAPPORT_BOT_PASSWORD };
  }
  const key = (process.env.CRM_API_KEY ?? "").split(",")[0].trim();
  if (!key) return null;
  const h = createHmac("sha256", key).update("netforce-rapport-bot").digest("hex");
  return { email: `assistant-ia-${h.slice(0, 8)}@netforce-defense.com`, password: h };
}

let rapportSignIn: Promise<void> | null = null;

async function signInBot(auth: Auth, db: Firestore, creds: { email: string; password: string }) {
  try {
    await signInWithEmailAndPassword(auth, creds.email, creds.password);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code !== "auth/user-not-found" && code !== "auth/invalid-credential") throw e;
    const cred = await createUserWithEmailAndPassword(auth, creds.email, creds.password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name: "Assistant IA",
      email: creds.email,
      isAdmin: false,
      isBot: true,
      createdAt: new Date().toISOString(),
    });
  }
}

/** Projet du rapport d'activité, lu avec le compte de l'Assistant IA. */
export async function rapportDb(): Promise<{ db: Firestore; uid: string } | null> {
  const creds = botCredentials();
  if (!creds) return null;
  const app = getApps().find((a) => a.name === RAPPORT_APP) ?? initializeApp(rapportConfig, RAPPORT_APP);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (!auth.currentUser) {
    rapportSignIn ??= signInBot(auth, db, creds).finally(() => {
      rapportSignIn = null;
    });
    await rapportSignIn;
  }
  return { db, uid: auth.currentUser!.uid };
}
