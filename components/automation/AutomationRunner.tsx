"use client";

import { useEffect } from "react";
import { CrmEvent } from "@/lib/contacts";
import { automationStores, runAutomationsForEvent } from "@/lib/automations";
import { logActivity } from "@/lib/activities";

/**
 * Monté dans le layout du dashboard : écoute les événements CRM émis par les
 * stores (création de contact, changement d'étape…) et exécute les
 * automatisations correspondantes. Ne rend rien.
 */
export default function AutomationRunner() {
  useEffect(() => {
    // Précharge le cache des scénarios pour que le moteur soit prêt.
    const unsub = automationStores.automations.subscribe(() => {});
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CrmEvent>).detail;
      void runAutomationsForEvent(detail);
      // Journal automatique des changements d'étape dans la timeline du contact.
      if (detail.type === "stage_changed") {
        void logActivity({
          contactId: detail.contact.id,
          type: "stage",
          text: `Étape : ${detail.from} → ${detail.to}`,
          auto: true,
        });
      }
    };
    window.addEventListener("netforce:crm-event", handler);
    return () => {
      unsub();
      window.removeEventListener("netforce:crm-event", handler);
    };
  }, []);

  return null;
}
