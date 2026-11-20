"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { db, getCrmAuth, sanitize } from "@/lib/firebase";
import { authFetch, useCrmUser } from "@/lib/rapport";
import { mergeState } from "@/lib/siege/merge";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Cb = (s: { data: Any }) => void;

// Le Siège (organigramme d'agents IA) tourne dans un cadre ; cette page lui fournit
// la base Firestore du CRM (temps réel), la session et l'IA du CRM, via window.__siegeBridge.
// Données : siege/state (projets, échanges, cerveau) + siegeTasks/{id} (une tâche par document) + siegeChats/{agent}.

function createBridge(me: () => { name: string; email: string }) {
  const stateRef = doc(db, "siege", "state");
  const tasksRef = collection(db, "siegeTasks");
  let stateDoc: Any = null, stateReady = false, tasksReady = false;
  const tasks = new Map<string, Any>();
  const listeners = new Set<Cb>();
  let sentTasks = new Set<string>(), sentProjects = new Set<string>();
  let started = false;

  const combined = () => {
    const s: Any = { me: "mkt", projects: [], links: [], kbEdits: {}, kbBase: {}, ...(stateDoc || {}) };
    delete s.updatedAt; delete s.updatedBy;
    s.tasks = [...tasks.values()].sort((a, b) => (a._o ?? 0) - (b._o ?? 0) || String(a.id).localeCompare(String(b.id)));
    return s;
  };
  const emit = () => {
    if (!stateReady || !tasksReady) return;
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
      onSnapshot(tasksRef, (snap) => { tasks.clear(); snap.docs.forEach((d) => tasks.set(d.id, d.data())); tasksReady = true; emit(); }, onErr),
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
    (mt as Any[]).forEach((t, i) => {
      const prev = tasks.get(t.id);
      const next = { ...t, _o: prev?._o ?? t._o ?? Date.now() + i };
      if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) ops.push((b) => b.set(doc(tasksRef, t.id), sanitize(next)));
    });
    gone.tasks.forEach((id) => { if (tasks.has(id)) ops.push((b) => b.delete(doc(tasksRef, id))); });
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

  return { doc: docFor, sample, me };
}

export default function SiegePage() {
  const { name, user, isAdmin } = useCrmUser() as { name: string; user: { email?: string | null } | null; isAdmin: boolean };
  const [ready, setReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setDbError((window as Any).__siegeError ?? null);
    window.addEventListener("siege-status", on);
    on();
    return () => window.removeEventListener("siege-status", on);
  }, []);
  useEffect(() => {
    const w = window as Any;
    if (!w.__siegeBridge) w.__siegeBridge = createBridge(() => ({ name: w.__siegeMe?.name || "", email: w.__siegeMe?.email || "" }));
    setReady(true);
  }, []);
  useEffect(() => { (window as Any).__siegeMe = { name, email: user?.email || "" }; }, [name, user]);
  if (!ready) return null;
  return (
    <div className="flex h-full flex-col">
      {dbError && (
        <div role="alert" className="bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Le Siège IA n&apos;arrive pas à lire la base ({dbError}) : nouvelle tentative automatique…</p>
          {dbError === "permission-denied" && (
            <p className="mt-1">
              Les règles de sécurité de la base refusent l&apos;accès.{" "}
              {isAdmin ? (
                <>
                  Va dans{" "}
                  <a href="/settings" className="font-semibold underline">
                    Paramètres
                  </a>{" "}
                  → « Règles de sécurité de la base » → <strong>Publier les règles</strong>, puis recharge cette page.
                </>
              ) : (
                "Préviens un admin : il doit publier les règles de sécurité dans Paramètres."
              )}
            </p>
          )}
        </div>
      )}
      <iframe src="/siege/index.html" title="Siège IA Netforce" className="block min-h-0 w-full flex-1 border-0" />
    </div>
  );
}
