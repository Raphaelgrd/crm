"use client";

import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { db, getCrmAuth, sanitize } from "@/lib/firebase";
import { authFetch } from "@/lib/rapport";
import { mergeState } from "@/lib/siege/merge";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Cb = (s: { data: Any }) => void;

// Pont entre le Siège (cadre /siege/index.html) et le CRM : base Firestore en temps réel, session, IA du CRM.
// Données : siege/state (projets, échanges, cerveau) + siegeTasks/{id} (une tâche par document) + siegeChats/{agent}.
// Tâches privées (décidées par un admin) : siegeTasksPrivate/{id}, lisibles par les admins seulement (règles Firestore).

export function createBridge(me: () => { name: string; email: string; isAdmin?: boolean }) {
  const stateRef = doc(db, "siege", "state");
  const tasksRef = collection(db, "siegeTasks");
  const privRef = collection(db, "siegeTasksPrivate");
  let stateDoc: Any = null, stateReady = false, tasksReady = false, privReady = true, privStarted = false;
  const pubTasks = new Map<string, Any>();
  const privTasks = new Map<string, Any>();
  const vanished = new Set<string>(), deleting = new Set<string>();
  const listeners = new Set<Cb>();
  let sentTasks = new Set<string>(), sentProjects = new Set<string>();
  let started = false;

  const combined = () => {
    const s: Any = { me: "mkt", projects: [], links: [], kbEdits: {}, kbBase: {}, ...(stateDoc || {}) };
    delete s.updatedAt; delete s.updatedBy;
    s.tasks = [...pubTasks.values(), ...[...privTasks.values()].map((t) => ({ ...t, prive: true }))].sort((a, b) => (a._o ?? 0) - (b._o ?? 0) || String(a.id).localeCompare(String(b.id)));
    return s;
  };
  const emit = () => {
    if (!stateReady || !tasksReady || !privReady) return;
    const s = combined();
    sentTasks = new Set(s.tasks.map((t: Any) => t.id));
    sentProjects = new Set(s.projects.map((p: Any) => p.id));
    const payload = { data: { v: 1, state: JSON.stringify(s), at: Date.now() } };
    listeners.forEach((l) => l(payload));
  };
  // Erreur de lecture de la base (ex. règles Firestore) : signalée à la page, et écoute relancée automatiquement.
  const report = (code: string | null) => {
    (window as Any).__siegeError = code;
    window.dispatchEvent(new Event("siege-status"));
  };
  const listen = (name: string, subscribe: (onErr: (e: Any) => void) => () => void) => {
    let failures = 0;
    const go = () => {
      const unsub = subscribe((e) => {
        console.error(name, e);
        unsub();
        failures += 1;
        report(e?.code || "erreur");
        setTimeout(go, Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5)));
      });
    };
    go();
  };
  const start = async () => {
    if (started) return;
    started = true;
    await getCrmAuth().authStateReady();
    listen("siege/state", (onErr) =>
      onSnapshot(stateRef, (snap) => { report(null); stateDoc = snap.exists() ? snap.data() : null; stateReady = true; emit(); }, onErr),
    );
    listen("siegeTasks", (onErr) =>
      onSnapshot(tasksRef, (snap) => {
        // Tâche disparue sans qu'on l'ait supprimée ici (rendue privée, ou supprimée ailleurs) : on ne la recrée pas.
        const now = new Set(snap.docs.map((d) => d.id));
        if (tasksReady) pubTasks.forEach((_, id) => { if (!now.has(id) && !deleting.has(id)) vanished.add(id); });
        pubTasks.clear(); snap.docs.forEach((d) => { pubTasks.set(d.id, d.data()); vanished.delete(d.id); }); tasksReady = true; emit();
      }, onErr),
    );
    startPrivate();
  };
  // Tâches privées : seulement pour un admin (le rôle peut être connu après l'ouverture de la page).
  const startPrivate = () => {
    if (!started || privStarted || !me().isAdmin) return;
    privStarted = true;
    privReady = false;
    listen("siegeTasksPrivate", (onErr) =>
      onSnapshot(privRef, (snap) => { privTasks.clear(); snap.docs.forEach((d) => privTasks.set(d.id, d.data())); privReady = true; emit(); }, onErr),
    );
  };

  async function saveState(value: Any) {
    const inc = JSON.parse(value.state);
    const incT = new Set<string>((inc.tasks || []).map((t: Any) => t.id));
    const incP = new Set<string>((inc.projects || []).map((p: Any) => p.id));
    const gone = { tasks: new Set([...sentTasks].filter((id) => !incT.has(id))), projects: new Set([...sentProjects].filter((id) => !incP.has(id))) };
    const cur = combined();
    const merged = mergeState(cur, inc, gone);
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const { tasks: mt, ...rest } = merged;
    const curRest = { ...cur }; delete curRest.tasks;
    if (JSON.stringify(rest) !== JSON.stringify(curRest)) ops.push((b) => b.set(stateRef, sanitize({ ...rest, updatedAt: Date.now(), updatedBy: me().email })));
    const admin = !!me().isAdmin;
    (mt as Any[]).forEach((t, i) => {
      const wasPriv = privTasks.has(t.id);
      if (!wasPriv && vanished.has(t.id)) return;
      const prev = wasPriv ? { ...privTasks.get(t.id), prive: true } : pubTasks.get(t.id);
      // Seul un admin peut rendre une tâche privée (ou publique) ; la base le vérifie aussi.
      const priv = admin ? !!t.prive : wasPriv;
      if (priv && !admin) return;
      const next = { ...t, _o: prev?._o ?? t._o ?? Date.now() + i };
      if (priv) next.prive = true; else delete next.prive;
      if (prev && JSON.stringify(prev) === JSON.stringify(next) && priv === wasPriv) return;
      ops.push((b) => b.set(doc(priv ? privRef : tasksRef, t.id), sanitize(next)));
      // Changement de visibilité : la tâche quitte l'autre collection.
      if (priv && pubTasks.has(t.id)) { deleting.add(t.id); ops.push((b) => b.delete(doc(tasksRef, t.id))); }
      if (!priv && wasPriv) ops.push((b) => b.delete(doc(privRef, t.id)));
    });
    gone.tasks.forEach((id) => {
      if (pubTasks.has(id)) { deleting.add(id); ops.push((b) => b.delete(doc(tasksRef, id))); }
      if (privTasks.has(id) && admin) ops.push((b) => b.delete(doc(privRef, id)));
    });
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(b));
      await b.commit();
    }
  }

  const docFor = (key: string) => {
    if (key === "hq/state") {
      return {
        get: async () => { await start(); return { data: { v: 1, state: JSON.stringify(combined()) } }; },
        set: (v: Any) => saveState(v),
        onSnapshot: (cb: Cb) => { listeners.add(cb); start(); emit(); return () => listeners.delete(cb); },
      };
    }
    const ref = doc(db, "siegeChats", key.replace(/^chat\//, "").replace(/[^\w-]/g, "_"));
    return {
      get: async () => { const s = await getDoc(ref); return { data: s.exists() ? s.data() : null }; },
      set: (v: Any) => setDoc(ref, sanitize(v)),
      onSnapshot: (cb: Cb) => onSnapshot(ref, (s) => cb({ data: s.exists() ? s.data() : null })),
      delete: () => deleteDoc(ref),
    };
  };

  async function sample() {
    const r = await authFetch("/api/siege/ai").then((x) => (x.ok ? x.json() : { ok: false })).catch(() => ({ ok: false }));
    if (!r.ok) return null;
    const run = async (input: Any, opts: Any = {}) => {
      const messages: Any[] = typeof input === "string" ? [{ role: "user", content: input }] : input.map((m: Any) => ({ role: m.role, content: m.content }));
      const tools = (opts.tools || []).map((t: Any) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: "object", properties: {} } } }));
      const exec = Object.fromEntries((opts.tools || []).map((t: Any) => [t.name, t.execute]));
      let text = "";
      for (let turn = 0; turn < 8; turn++) {
        const res = await authFetch("/api/siege/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, tools }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw { code: j.code || "upstream_error", message: j.message };
        if (j.content) { text += (text ? "\n\n" : "") + j.content; opts.onText?.({ text, delta: j.content }); }
        if (!j.toolCalls?.length) return { text, truncated: false };
        messages.push({ role: "assistant", content: j.content || "", tool_calls: j.toolCalls });
        for (const c of j.toolCalls) {
          let out: Any;
          try { out = exec[c.function.name] ? await exec[c.function.name](JSON.parse(c.function.arguments || "{}")) : "Outil inconnu"; } catch (e) { out = "Erreur : " + ((e as Error)?.message || e); }
          messages.push({ role: "tool", tool_call_id: c.id, content: typeof out === "string" ? out : JSON.stringify(out) });
        }
      }
      return { text, truncated: true };
    };
    const fn: Any = (input: Any, opts?: Any) => run(input, opts);
    fn.json = async (input: Any, opts: Any = {}) => {
      const { text } = await run(typeof input === "string" ? input + "\n\nRéponds uniquement avec du JSON valide, sans texte autour." : input, opts);
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      try { return JSON.parse(text.slice(a, b + 1)); } catch { throw { code: "bad_json", text }; }
    };
    fn.limits = async () => ({ images: false });
    return fn;
  }

  return { doc: docFor, sample, me, refreshUser: startPrivate };
}

