"use client";

import { useEffect } from "react";
import { CrmEvent } from "@/lib/contacts";
import { runAutomationsForEvent } from "@/lib/automations";

/**
 * Monté dans le layout du dashboard : écoute les événements CRM émis par les
 * stores (création de contact, changement d'étape…) et exécute les
 * automatisations correspondantes. Ne rend rien.
 */
export default function AutomationRunner() {
  useEffect(() => {
    const handler = (e: Event) => {
      runAutomationsForEvent((e as CustomEvent<CrmEvent>).detail);
    };
    window.addEventListener("netforce:crm-event", handler);
    return () => window.removeEventListener("netforce:crm-event", handler);
  }, []);

  return null;
}
