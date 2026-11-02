import { Resend } from "resend";
import { contactVariables, fillHtmlVariables, fillVariables, renderEmailHtml, renderEmailText, type EmailTemplate } from "@/lib/templateRender";
import { store } from "./store";
import { unsubscribeUrl, unsubscribedEmails } from "./unsubscribe";

// Moteur d'automatisations, exécuté côté serveur : il réagit aux contacts créés ou changés d'étape,
// qu'ils viennent de l'écran, du formulaire du site, de l'assistant IA ou du connecteur MCP.
// Même format de données que l'écran Automatisations (collection "automations").

export const STAGES = ["Nouveau", "À rappeler", "RDV pris", "Pré-qualifié", "Converti (contrat signé)", "Fermé", "Doublon"];
export const CATEGORIES = ["Prospect", "Client", "Partenaire", "Fournisseur", "Investisseur", "Distributeur", "Ambassadeur", "Institutionnel", "Banque"];

export type TriggerType = "contact_created" | "stage_changed";
export interface Trigger {
  type: TriggerType;
  /** stage_changed : étape d'arrivée ("" = n'importe laquelle). */
  stage: string;
  /** Limite aux contacts de cette catégorie ("" ou absent = tous). */
  category?: string;
}

export type Action =
  | { type: "send_email"; templateId: string }
  | { type: "create_task"; title: string; dueInDays: number }
  | { type: "set_stage"; stage: string }
  | { type: "set_category"; category: string };

export interface Automation {
  id: string;
  name: string;
  description: string;
  active: boolean;
  trigger: Trigger;
  actions: Action[];
  runs: number;
  createdAt: string;
  updatedAt: string;
}

export type AutomationInput = Pick<Automation, "name" | "description" | "active" | "trigger" | "actions">;

export interface ContactDoc {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  category?: string;
  stage?: string;
  unsubscribedAt?: string;
}

export type AutomationEvent =
  | { type: "contact_created"; contactId: string }
  | { type: "stage_changed"; contactId: string; from: string; to: string };

export class AutomationError extends Error {}

const makeId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fullName = (c: ContactDoc) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || "contact";

// --- Validation (écran, API et assistant IA) ---

/** Vérifie et normalise une automatisation ; message clair en cas d'erreur. */
export async function validateAutomation(raw: Record<string, unknown>): Promise<AutomationInput> {
  const name = str(raw.name, 120);
  if (!name) throw new AutomationError("Donne un nom à l'automatisation.");
  const t = (raw.trigger ?? {}) as Record<string, unknown>;
  const type = str(t.type) as TriggerType;
  if (type !== "contact_created" && type !== "stage_changed") {
    throw new AutomationError("Déclencheur inconnu : contact_created (nouveau contact) ou stage_changed (changement d'étape).");
  }
  const stage = type === "stage_changed" ? str(t.stage) : "";
  if (stage && !STAGES.includes(stage)) throw new AutomationError(`Étape inconnue « ${stage} ». Étapes : ${STAGES.join(", ")}.`);
  const category = str(t.category);
  if (category && !CATEGORIES.includes(category)) {
    throw new AutomationError(`Catégorie inconnue « ${category} ». Catégories : ${CATEGORIES.join(", ")}.`);
  }

  const rawActions = Array.isArray(raw.actions) ? (raw.actions as Record<string, unknown>[]) : [];
  if (!rawActions.length) throw new AutomationError("Ajoute au moins une action.");
  if (rawActions.length > 10) throw new AutomationError("10 actions maximum.");
  const templates = await (await store()).list("templates");
  const actions: Action[] = rawActions.map((a) => {
    switch (str(a.type)) {
      case "send_email": {
        const id = str(a.templateId);
        const tpl = templates.find((x) => x.id === id);
        if (!tpl) throw new AutomationError(`Modèle d'email introuvable : « ${id} ». Utilise un id de la liste des modèles.`);
        if (tpl.type && tpl.type !== "Email") throw new AutomationError(`« ${tpl.name} » n'est pas un modèle d'email.`);
        return { type: "send_email", templateId: id };
      }
      case "create_task": {
        const title = str(a.title, 150);
        if (!title) throw new AutomationError("Une tâche doit avoir un titre.");
        const d = Number(a.dueInDays ?? 0);
        return { type: "create_task", title, dueInDays: Number.isFinite(d) ? Math.min(365, Math.max(0, Math.round(d))) : 0 };
      }
      case "set_stage": {
        const s = str(a.stage);
        if (!STAGES.includes(s)) throw new AutomationError(`Étape inconnue « ${s} ». Étapes : ${STAGES.join(", ")}.`);
        return { type: "set_stage", stage: s };
      }
      case "set_category": {
        const c = str(a.category);
        if (!CATEGORIES.includes(c)) throw new AutomationError(`Catégorie inconnue « ${c} ». Catégories : ${CATEGORIES.join(", ")}.`);
        return { type: "set_category", category: c };
      }
      default:
        throw new AutomationError(`Action inconnue « ${str(a.type)} ». Actions : send_email, create_task, set_stage, set_category.`);
    }
  });
  return {
    name,
    description: str(raw.description, 500),
    active: raw.active !== false,
    trigger: { type, stage, ...(category ? { category } : {}) },
    actions,
  };
}

export async function listAutomations(): Promise<Automation[]> {
  return ((await (await store()).list("automations")) as unknown as Automation[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAutomation(input: AutomationInput): Promise<Automation> {
  const now = new Date().toISOString();
  const a: Automation = { ...input, id: makeId("a"), runs: 0, createdAt: now, updatedAt: now };
  await (await store()).set("automations", a.id, { ...a });
  return a;
}

export async function getAutomation(id: string): Promise<Automation | null> {
  if (!/^[\w-]{3,80}$/.test(id)) return null;
  return ((await (await store()).get("automations", id)) as unknown as Automation | null) ?? null;
}

export async function patchAutomation(id: string, patch: Partial<AutomationInput>): Promise<void> {
  await (await store()).update("automations", id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function deleteAutomation(id: string): Promise<void> {
  await (await store()).remove("automations", id);
}

/** Phrase lisible pour l'assistant et l'écran. */
export function describeAutomation(a: Pick<Automation, "trigger" | "actions">, templateName: (id: string) => string): string {
  const who = a.trigger.category ? `un contact « ${a.trigger.category} »` : "un contact";
  const when =
    a.trigger.type === "contact_created"
      ? `Quand ${who} est créé`
      : `Quand ${who} passe ${a.trigger.stage ? `en « ${a.trigger.stage} »` : "à une nouvelle étape"}`;
  const what = a.actions.map((x) =>
    x.type === "send_email"
      ? `envoyer l'email « ${templateName(x.templateId)} »`
      : x.type === "create_task"
        ? `créer la tâche « ${x.title} » à J+${x.dueInDays}`
        : x.type === "set_stage"
          ? `passer en « ${x.stage} »`
          : `mettre la catégorie « ${x.category} »`,
  );
  return `${when} : ${what.join(", puis ")}.`;
}

// --- Exécution ---

async function logActivity(contactId: string, type: string, text: string) {
  const t = new Date().toISOString();
  const id = makeId("act");
  await (await store()).set("activities", id, { id, contactId, type, text, at: t, auto: true, createdAt: t, updatedAt: t });
}

/** Envoie le modèle au contact via Resend ; sinon le met en file d'attente (envoi manuel depuis l'écran). */
async function sendTemplate(a: Automation, tpl: EmailTemplate, c: ContactDoc, optedOut: Set<string>): Promise<string> {
  const email = (c.email ?? "").trim();
  if (!email) return `Email « ${tpl.name} » non envoyé : pas d'adresse`;
  if (c.unsubscribedAt || optedOut.has(email.toLowerCase())) return `Email « ${tpl.name} » non envoyé : désabonné`;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const id = makeId("q");
    await (await store()).set("emailQueue", id, { id, contactId: c.id, templateId: tpl.id, automationName: a.name, at: new Date().toISOString() });
    return `Email « ${tpl.name} » mis en file d'attente (envoi automatique non configuré)`;
  }
  const vars = contactVariables({
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    company: c.company ?? "",
    email,
    phone: c.phone ?? "",
  });
  const unsub = unsubscribeUrl(email);
  const footer = `<p style="font-family:Arial,sans-serif;font-size:11px;color:#888;text-align:center;margin:16px 0">Vous recevez cet email car vous êtes en relation avec Netforce. <a href="${unsub}" style="color:#888">Se désabonner</a></p>`;
  const html = fillHtmlVariables(renderEmailHtml(tpl), vars).replace("</body>", `${footer}</body>`);
  const text = `${fillVariables(renderEmailText(tpl), vars)}\n\n—\nSe désabonner : ${unsub}`;
  const { error } = await new Resend(key).emails.send({
    from: "Netforce <contact@mail.netforce-defense.com>",
    to: email,
    subject: fillVariables(tpl.subject || tpl.name, vars),
    html,
    text,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  if (error) throw new Error(error.message);
  await logActivity(c.id, "email", `Email automatique envoyé : « ${tpl.name} » (automatisation « ${a.name} »)`);
  return `Email « ${tpl.name} » envoyé à ${email}`;
}

async function execute(a: Automation, c: ContactDoc, optedOut: Set<string>): Promise<string[]> {
  const db = await store();
  const summary: string[] = [];
  for (const action of a.actions) {
    try {
      switch (action.type) {
        case "send_email": {
          const tpl = (await db.get("templates", action.templateId)) as unknown as EmailTemplate | null;
          summary.push(tpl ? await sendTemplate(a, tpl, c, optedOut) : `Email non envoyé : modèle supprimé`);
          break;
        }
        case "create_task": {
          const due = new Date(Date.now() + action.dueInDays * 86_400_000);
          const t = new Date().toISOString();
          const id = makeId("e");
          await db.set("agenda", id, {
            id,
            type: "tache",
            title: action.title,
            date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(due),
            startTime: "",
            endTime: "",
            contactId: c.id,
            contactName: fullName(c),
            notes: `Créée par l'automatisation « ${a.name} »`,
            visio: false,
            done: false,
            createdAt: t,
            updatedAt: t,
          });
          summary.push(`Tâche créée : « ${action.title} »`);
          break;
        }
        case "set_stage":
          if (c.stage !== action.stage) {
            await db.update("contacts", c.id, { stage: action.stage, updatedAt: new Date().toISOString() });
            await logActivity(c.id, "stage", `Étape : ${c.stage ?? "?"} → ${action.stage} (automatisation)`);
            c.stage = action.stage;
          }
          summary.push(`Étape → ${action.stage}`);
          break;
        case "set_category":
          await db.update("contacts", c.id, { category: action.category, updatedAt: new Date().toISOString() });
          c.category = action.category;
          summary.push(`Catégorie → ${action.category}`);
          break;
      }
    } catch (e) {
      // Une action en échec n'empêche pas les suivantes ; l'échec est visible dans l'historique.
      summary.push(`Échec : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}

/**
 * Exécute les automatisations actives qui correspondent à l'événement.
 * Les actions des automatisations ne redéclenchent pas d'autres automatisations (pas de boucle).
 */
export async function runAutomations(event: AutomationEvent): Promise<{ automation: string; summary: string[] }[]> {
  const db = await store();
  let contact: ContactDoc | null = null;
  // Le contact vient parfois d'être écrit : on laisse un court délai à la base.
  for (let i = 0; i < 3 && !contact; i++) {
    contact = (await db.get("contacts", event.contactId)) as unknown as ContactDoc | null;
    if (!contact) await new Promise((r) => setTimeout(r, 700));
  }
  if (!contact) return [];
  contact = { ...contact, id: event.contactId };

  const matching = (await listAutomations()).filter((a) => {
    if (!a.active || a.trigger.type !== event.type) return false;
    if (event.type === "stage_changed" && a.trigger.stage && a.trigger.stage !== event.to) return false;
    if (a.trigger.category && a.trigger.category !== contact!.category) return false;
    return true;
  });
  if (!matching.length) return [];

  const optedOut = await unsubscribedEmails().catch(() => new Set<string>());
  const results = [];
  for (const a of matching) {
    const summary = await execute(a, contact, optedOut);
    const at = new Date().toISOString();
    const logId = makeId("l");
    await db.set("automationLog", logId, { id: logId, automationName: a.name, contactName: fullName(contact), summary, at });
    await db.update("automations", a.id, { runs: (a.runs ?? 0) + 1 });
    results.push({ automation: a.name, summary });
  }
  return results;
}

/** Lance les automatisations sans jamais faire échouer l'opération d'origine (création de contact…). */
export async function runAutomationsSafely(event: AutomationEvent) {
  try {
    return await runAutomations(event);
  } catch (e) {
    console.error("[automations]", e);
    return [];
  }
}
