"use client";

import { useEffect, useState } from "react";
import { useCrmUser } from "@/lib/rapport";
import { createBridge } from "@/lib/siege/bridge";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

// Le Siège (organigramme d'agents IA) tourne dans un cadre ; cette page lui fournit
// la base Firestore du CRM (temps réel), la session et l'IA du CRM, via window.__siegeBridge.
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
    if (!w.__siegeBridge) w.__siegeBridge = createBridge(() => ({ name: w.__siegeMe?.name || "", email: w.__siegeMe?.email || "", isAdmin: !!w.__siegeMe?.isAdmin }));
    setReady(true);
  }, []);
  useEffect(() => {
    const w = window as Any;
    w.__siegeMe = { name, email: user?.email || "", isAdmin: !!isAdmin };
    w.__siegeBridge?.refreshUser?.();
  }, [name, user, isAdmin]);
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
