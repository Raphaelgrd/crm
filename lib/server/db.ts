import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore/lite";

const CRM_APP = "server-crm";

export function crmDb(): Firestore {
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

let rapportSignIn: Promise<void> | null = null;

/** Projet du rapport d'activité : lisible seulement par un compte connecté (RAPPORT_BOT_EMAIL / PASSWORD). */
export async function rapportDb(): Promise<Firestore | null> {
  const email = process.env.RAPPORT_BOT_EMAIL;
  const password = process.env.RAPPORT_BOT_PASSWORD;
  if (!email || !password) return null;
  const app = getApps().find((a) => a.name === RAPPORT_APP) ?? initializeApp(rapportConfig, RAPPORT_APP);
  const auth = getAuth(app);
  if (!auth.currentUser) {
    rapportSignIn ??= signInWithEmailAndPassword(auth, email, password)
      .then(() => undefined)
      .finally(() => {
        rapportSignIn = null;
      });
    await rapportSignIn;
  }
  return getFirestore(app);
}
