"use client";

import { useCallback, useEffect, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

// ⚠️ Le Rapport d'Activité (pointage des heures) vit sur SON PROPRE projet
// Firebase (netforce-38edf), distinct du CRM (crm-netforce) : les comptes de
// l'équipe, les tâches et l'historique de pointage existants continuent de
// fonctionner sans aucune migration. Portage de l'appli d'origine
// (~/Downloads/index.html), pièces jointes exclues (elles étaient stockées
// en localStorage, pas dans le cloud).

const RAPPORT_APP_NAME = "rapport";
const ADMIN_EMAIL = "gerardraphael01@gmail.com";

const rapportConfig = {
  apiKey: "AIzaSyABOcipg9S2LNSx-MBYa66xYBJA2E2MYdM",
  authDomain: "netforce-38edf.firebaseapp.com",
  projectId: "netforce-38edf",
  storageBucket: "netforce-38edf.firebasestorage.app",
  messagingSenderId: "562828872246",
  appId: "1:562828872246:web:09b24b68e4c879f182a697",
};

function rapportApp() {
  return getApps().find((a) => a.name === RAPPORT_APP_NAME) ?? initializeApp(rapportConfig, RAPPORT_APP_NAME);
}
const auth = () => getAuth(rapportApp());
const db = () => getFirestore(rapportApp());

// --- Types (modèle de l'appli d'origine, inchangé) ---

export const TASK_CATEGORIES = [
  "Création visuelle",
  "Community management",
  "Rédaction / Copywriting",
  "Stratégie marketing",
  "Veille concurrentielle",
  "Événementiel",
  "Reporting / Analytics",
  "SEO / SEA",
  "Email marketing",
  "Réseaux sociaux",
  "Relations presse",
  "Autre",
];

export const TASK_STATUSES = ["En cours", "En attente", "Terminé", "Bloqué"] as const;
export const VALIDATION_STATUSES = ["À valider", "Validé", "Refusé"] as const;
export const PRIORITIES = ["Haute", "Normale", "Basse"] as const;

export interface RapportUser {
  name?: string;
  email?: string;
  validators?: string[];
  isAdmin?: boolean;
}

export interface RapportTask {
  id: string;
  name: string;
  category: string;
  description?: string;
  priority?: string;
  validator?: string;
  sharepointLink?: string;
  blocking?: string;
  ownerId: string;
  visibility?: "all" | "admin";
  sharedWith?: string[];
  archived?: boolean;
  createdAt?: string;
}

export interface RapportLog {
  id: string;
  taskId: string;
  taskName?: string;
  taskCategory?: string;
  ownerId: string;
  ownerName?: string;
  date: string; // YYYY-MM-DD
  timeSpent: number;
  progress: number;
  status: string;
  validationStatus?: string;
}

export interface RapportData {
  settings: RapportUser;
  tasks: RapportTask[];
  logs: RapportLog[];
  users: Record<string, RapportUser>;
}

export const todayKey = () => new Date().toISOString().split("T")[0];

export function fmtDateFr(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function isoWeek(iso: string) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return `${1 + Math.round(((d.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7)}-${d.getFullYear()}`;
}

export function initials(n: string) {
  return (
    (n || "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

const frAuthErrors: Record<string, string> = {
  "auth/invalid-email": "Adresse email invalide.",
  "auth/user-not-found": "Aucun compte avec cet email.",
  "auth/wrong-password": "Mot de passe incorrect.",
  "auth/invalid-credential": "Email ou mot de passe incorrect.",
  "auth/email-already-in-use": "Cet email est déjà utilisé.",
  "auth/weak-password": "Mot de passe trop court (min. 6 caractères).",
  "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
};

export function frAuthError(code: string) {
  return frAuthErrors[code] ?? "Erreur de connexion. Réessayez.";
}

// --- Auth partagée : le compte du Rapport d'activité EST le compte du CRM ---

export function getRapportAuth() {
  return auth();
}

export async function signInRapport(email: string, password: string) {
  await signInWithEmailAndPassword(auth(), email, password);
}

export async function signUpRapport(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth(), email, password);
  await setDoc(doc(db(), "users", cred.user.uid), {
    name,
    email: cred.user.email,
    validators: ["Laurent", "Sébastien"],
    isAdmin: false,
    createdAt: new Date().toISOString(),
  });
}

export async function signOutRapport() {
  await fbSignOut(auth());
}

/** Session + prénom de l'utilisateur connecté (pour l'en-tête du CRM). */
export function useCrmUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth(), (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        void getDoc(doc(db(), "users", u.uid)).then((snap) => {
          const n = (snap.data() as RapportUser | undefined)?.name;
          setName(n || u.email?.split("@")[0] || "");
        });
      } else {
        setName("");
      }
    });
  }, []);

  return { user, loading, name };
}

const EMPTY_DATA: RapportData = {
  settings: { name: "", validators: ["Laurent", "Sébastien"] },
  tasks: [],
  logs: [],
  users: {},
};

export function useRapport() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [data, setData] = useState<RapportData>(EMPTY_DATA);

  const loadData = useCallback(async (u: User) => {
    setDataLoading(true);
    try {
      const uSnap = await getDoc(doc(db(), "users", u.uid));
      const settings: RapportUser = uSnap.exists()
        ? { validators: ["Laurent", "Sébastien"], ...(uSnap.data() as RapportUser) }
        : { name: "", validators: ["Laurent", "Sébastien"] };
      if (u.email === ADMIN_EMAIL && !settings.isAdmin) {
        await setDoc(doc(db(), "users", u.uid), { isAdmin: true }, { merge: true });
        settings.isAdmin = true;
      }
      const [tSnap, lSnap, usersSnap] = await Promise.all([
        getDocs(collection(db(), "tasks")),
        getDocs(query(collection(db(), "logs"), where("ownerId", "==", u.uid))),
        getDocs(collection(db(), "users")),
      ]);
      setData({
        settings,
        tasks: tSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RapportTask),
        logs: lSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RapportLog),
        users: Object.fromEntries(usersSnap.docs.map((d) => [d.id, d.data() as RapportUser])),
      });
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth(), (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) void loadData(u);
      else setData(EMPTY_DATA);
    });
  }, [loadData]);

  const signIn = useCallback(signInRapport, []);
  const signUp = useCallback(signUpRapport, []);
  const signOutUser = useCallback(signOutRapport, []);

  const isAdmin = user?.email === ADMIN_EMAIL || data.settings.isAdmin === true;

  const ownerName = data.settings.name || user?.email?.split("@")[0] || "?";

  // --- Tâches ---

  const saveTask = useCallback(
    async (
      taskId: string | null,
      fields: Omit<RapportTask, "id" | "ownerId">,
      opts: { ownerId: string; firstLog?: { timeSpent: number; progress: number; status: string } },
    ): Promise<void> => {
      if (taskId) {
        await updateDoc(doc(db(), "tasks", taskId), { ...fields });
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, ...fields } : t)),
        }));
      } else {
        const taskData = {
          ...fields,
          ownerId: opts.ownerId,
          sharedWith: [],
          archived: false,
          createdAt: todayKey(),
        };
        const ref = await addDoc(collection(db(), "tasks"), taskData);
        const task: RapportTask = { id: ref.id, ...taskData };
        let newLog: RapportLog | null = null;
        if (opts.firstLog && opts.firstLog.timeSpent > 0 && user) {
          const logData = {
            taskId: ref.id,
            taskName: fields.name,
            taskCategory: fields.category,
            ownerId: user.uid,
            ownerName,
            date: todayKey(),
            timeSpent: opts.firstLog.timeSpent,
            progress: opts.firstLog.progress,
            status: opts.firstLog.status,
            validationStatus: "À valider",
          };
          const lref = await addDoc(collection(db(), "logs"), logData);
          newLog = { id: lref.id, ...logData };
        }
        setData((d) => ({
          ...d,
          tasks: [...d.tasks, task],
          logs: newLog ? [...d.logs, newLog] : d.logs,
        }));
      }
    },
    [user, ownerName],
  );

  const setArchived = useCallback(async (taskId: string, archived: boolean) => {
    await updateDoc(doc(db(), "tasks", taskId), { archived });
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, archived } : t)),
    }));
  }, []);

  const shareTask = useCallback(async (taskId: string, uid: string, add: boolean) => {
    setData((d) => {
      const task = d.tasks.find((t) => t.id === taskId);
      if (!task) return d;
      const updated = add
        ? Array.from(new Set([...(task.sharedWith ?? []), uid]))
        : (task.sharedWith ?? []).filter((u) => u !== uid);
      void updateDoc(doc(db(), "tasks", taskId), { sharedWith: updated });
      return {
        ...d,
        tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, sharedWith: updated } : t)),
      };
    });
  }, []);

  // --- Pointages ---

  const saveLog = useCallback(
    async (
      task: RapportTask,
      values: { timeSpent: number; progress: number; status: string; validationStatus: string },
    ) => {
      if (!user) return;
      const existing = data.logs.find((l) => l.taskId === task.id && l.date === todayKey());
      if (existing) {
        await updateDoc(doc(db(), "logs", existing.id), { ...values });
        setData((d) => ({
          ...d,
          logs: d.logs.map((l) => (l.id === existing.id ? { ...l, ...values } : l)),
        }));
      } else {
        const logData = {
          taskId: task.id,
          taskName: task.name,
          taskCategory: task.category,
          ownerId: user.uid,
          ownerName,
          date: todayKey(),
          ...values,
        };
        const ref = await addDoc(collection(db(), "logs"), logData);
        setData((d) => ({ ...d, logs: [...d.logs, { id: ref.id, ...logData }] }));
      }
    },
    [user, ownerName, data.logs],
  );

  const deleteTodayLog = useCallback(
    async (taskId: string) => {
      const existing = data.logs.find((l) => l.taskId === taskId && l.date === todayKey());
      if (!existing) return;
      await deleteDoc(doc(db(), "logs", existing.id));
      setData((d) => ({ ...d, logs: d.logs.filter((l) => l.id !== existing.id) }));
    },
    [data.logs],
  );

  /** Journal : pointages de TOUT LE MONDE pour une date (requête dédiée). */
  const journalFor = useCallback(async (date: string): Promise<RapportLog[]> => {
    const snap = await getDocs(query(collection(db(), "logs"), where("date", "==", date)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RapportLog);
  }, []);

  // --- Paramètres / admin ---

  const saveSettings = useCallback(
    async (name: string, validators: string[]) => {
      if (!user) return;
      await setDoc(doc(db(), "users", user.uid), { name, validators }, { merge: true });
      setData((d) => ({
        ...d,
        settings: { ...d.settings, name, validators },
        users: { ...d.users, [user.uid]: { ...d.users[user.uid], name } },
      }));
    },
    [user],
  );

  const toggleAdmin = useCallback(async (uid: string, makeAdmin: boolean) => {
    await setDoc(doc(db(), "users", uid), { isAdmin: makeAdmin }, { merge: true });
    setData((d) => ({
      ...d,
      users: { ...d.users, [uid]: { ...d.users[uid], isAdmin: makeAdmin } },
    }));
  }, []);

  return {
    user,
    authLoading,
    dataLoading,
    data,
    isAdmin,
    ownerName,
    signIn,
    signUp,
    signOutUser,
    saveTask,
    setArchived,
    shareTask,
    saveLog,
    deleteTodayLog,
    journalFor,
    saveSettings,
    toggleAdmin,
  };
}

// --- Helpers de vue ---

export function canSeeTask(task: RapportTask, uid: string | undefined, admin: boolean) {
  if (admin) return true;
  if (uid && task.sharedWith?.includes(uid)) return true;
  if (task.visibility === "admin") return false;
  return true;
}

export function latestLog(logs: RapportLog[], taskId: string): RapportLog | null {
  return (
    logs
      .filter((l) => l.taskId === taskId)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

export function todayLog(logs: RapportLog[], taskId: string): RapportLog | null {
  return logs.find((l) => l.taskId === taskId && l.date === todayKey()) ?? null;
}
