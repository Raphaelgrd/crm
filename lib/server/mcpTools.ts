import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore/lite";
import { crmDb, rapportDb } from "./db";

type Args = Record<string, unknown>;
type Doc = Record<string, unknown> & { id: string };

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  run: (args: Args) => Promise<unknown>;
}

// Copie des étapes de lib/contacts.ts (fichier client, non importable côté serveur).
const STAGES = [
  "Nouveau",
  "À rappeler",
  "RDV pris",
  "Pré-qualifié",
  "Converti (contrat signé)",
  "Fermé",
  "Doublon",
];

const ACTIVITY_TYPES = ["note", "call", "email", "meeting"];

export class ToolError extends Error {}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const optStr = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const makeId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isDateKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function all(name: string): Promise<Doc[]> {
  const snap = await getDocs(collection((await crmDb()), name));
  return snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
}

async function one(name: string, id: string): Promise<Doc | null> {
  if (!id) return null;
  const snap = await getDoc(doc((await crmDb()), name, id));
  return snap.exists() ? { ...(snap.data() as Record<string, unknown>), id: snap.id } : null;
}

async function logActivity(contactId: string, type: string, text: string, auto: boolean) {
  const t = now();
  const id = makeId("act");
  await setDoc(doc((await crmDb()), "activities", id), {
    id,
    contactId,
    type,
    text,
    at: t,
    auto,
    createdAt: t,
    updatedAt: t,
  });
}

function contactSummary(c: Doc) {
  return {
    id: c.id,
    name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
    email: c.email,
    phone: c.phone,
    company: c.company,
    category: c.category,
    stage: c.stage,
    tags: c.tags ?? [],
    nextFollowUpAt: c.nextFollowUpAt ?? null,
  };
}

function pick(args: Args, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (args[k] === undefined) continue;
    out[k] = typeof args[k] === "string" ? (args[k] as string).trim() : args[k];
  }
  return out;
}

function checkStage(stage: unknown) {
  if (stage !== undefined && !STAGES.includes(String(stage))) {
    throw new ToolError(`Étape inconnue « ${stage} ». Étapes valides : ${STAGES.join(", ")}`);
  }
}

function checkFollowUp(v: unknown) {
  if (v !== undefined && v !== "" && !isDateKey(String(v))) {
    throw new ToolError("nextFollowUpAt doit être au format YYYY-MM-DD (ou vide pour retirer la relance).");
  }
}

async function teamDb() {
  const r = await rapportDb();
  if (!r) throw new ToolError("CRM_API_KEY n'est pas configurée sur le serveur.");
  const me = await getDoc(doc(r.db, "users", r.uid));
  if (me.data()?.isAdmin !== true) {
    throw new ToolError(
      "L'Assistant IA n'a pas encore accès à l'activité de l'équipe. Un admin doit cliquer sur « Donner l'accès » à côté d'« Assistant IA » dans Paramètres → Équipe et accès du CRM, puis réessayer.",
    );
  }
  return r.db;
}

const contactFields = {
  firstName: { type: "string" },
  lastName: { type: "string" },
  email: { type: "string" },
  phone: { type: "string" },
  company: { type: "string" },
  category: {
    type: "string",
    description:
      "Catégorie : Prospect, Client, Partenaire, Fournisseur, Investisseur, Distributeur, Ambassadeur, Institutionnel, Banque…",
  },
  stage: { type: "string", enum: STAGES, description: "Étape du pipeline" },
  notes: { type: "string" },
  tags: { type: "array", items: { type: "string" } },
  country: { type: "string" },
  nextFollowUpAt: { type: "string", description: "Date de relance YYYY-MM-DD, vide pour retirer" },
};

const CONTACT_KEYS = Object.keys(contactFields);

export const TOOLS: ToolDef[] = [
  // ── Lecture ────────────────────────────────────────────────
  {
    name: "search_contacts",
    description:
      "Recherche des contacts du CRM Netforce (nom, email, société, tags, notes). Filtres optionnels par catégorie, étape ou tag.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texte libre" },
        category: { type: "string" },
        stage: { type: "string", enum: STAGES },
        tag: { type: "string" },
        limit: { type: "number", description: "Nombre max de résultats (défaut 25, max 200)" },
      },
    },
    async run(a) {
      const q = norm(a.query);
      const cat = norm(a.category);
      const stage = str(a.stage);
      const tag = norm(a.tag);
      const contacts = await all("contacts");
      const hits = contacts.filter((c) => {
        const hay = norm(
          [c.firstName, c.lastName, c.email, c.company, c.phone, c.notes, ...((c.tags as string[]) ?? [])].join(" "),
        );
        return (
          (!q || q.split(/\s+/).every((w) => hay.includes(w))) &&
          (!cat || norm(c.category) === cat) &&
          (!stage || c.stage === stage) &&
          (!tag || ((c.tags as string[]) ?? []).some((t) => norm(t) === tag))
        );
      });
      const limit = Math.min(num(a.limit, 25), 200);
      return { total: hits.length, contacts: hits.slice(0, limit).map(contactSummary) };
    },
  },
  {
    name: "get_contact",
    description:
      "Fiche complète d'un contact : informations, historique (notes, appels, emails, RDV, changements d'étape), événements d'agenda et prêts liés.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"],
    },
    async run(a) {
      const id = str(a.contactId);
      const c = await one("contacts", id);
      if (!c) throw new ToolError(`Contact introuvable : ${id}`);
      const db = (await crmDb());
      const [acts, events, loans] = await Promise.all([
        getDocs(query(collection(db, "activities"), where("contactId", "==", id))),
        getDocs(query(collection(db, "agenda"), where("contactId", "==", id))),
        getDocs(query(collection(db, "loans"), where("contactId", "==", id))),
      ]);
      const timeline = acts.docs
        .map((d) => d.data() as Record<string, unknown>)
        .sort((x, y) => String(y.at).localeCompare(String(x.at)))
        .slice(0, 50)
        .map((x) => ({ at: x.at, type: x.type, text: x.text }));
      return {
        contact: c,
        timeline,
        agenda: events.docs.map((d) => d.data()),
        loans: loans.docs.map((d) => d.data()),
      };
    },
  },
  {
    name: "pipeline_summary",
    description:
      "Vue d'ensemble du pipeline commercial : nombre de contacts par étape et par catégorie, relances en retard / du jour.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    async run() {
      const contacts = await all("contacts");
      const byStage: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      const t = today();
      let overdue = 0;
      let dueToday = 0;
      for (const c of contacts) {
        byStage[String(c.stage || "—")] = (byStage[String(c.stage || "—")] ?? 0) + 1;
        byCategory[String(c.category || "—")] = (byCategory[String(c.category || "—")] ?? 0) + 1;
        const f = String(c.nextFollowUpAt ?? "");
        if (f && f < t) overdue++;
        if (f === t) dueToday++;
      }
      return { totalContacts: contacts.length, byStage, byCategory, followUps: { overdue, today: dueToday } };
    },
  },
  {
    name: "list_follow_ups",
    description: "Liste les contacts à relancer : en retard, aujourd'hui ou à venir (selon leur date de relance).",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["overdue", "today", "upcoming", "all"], description: "Défaut : all" },
        days: { type: "number", description: "Pour upcoming : horizon en jours (défaut 14)" },
      },
    },
    async run(a) {
      const status = str(a.status) || "all";
      const t = today();
      const horizon = new Date(Date.now() + num(a.days, 14) * 86_400_000).toISOString().slice(0, 10);
      const contacts = (await all("contacts")).filter((c) => {
        const f = String(c.nextFollowUpAt ?? "");
        if (!f) return false;
        if (status === "overdue") return f < t;
        if (status === "today") return f === t;
        if (status === "upcoming") return f > t && f <= horizon;
        return true;
      });
      contacts.sort((x, y) => String(x.nextFollowUpAt).localeCompare(String(y.nextFollowUpAt)));
      return { total: contacts.length, contacts: contacts.map(contactSummary) };
    },
  },
  {
    name: "list_organizations",
    description: "Liste les organisations (comptes) du CRM, avec recherche optionnelle.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    async run(a) {
      const q = norm(a.query);
      const orgs = (await all("organizations")).filter(
        (o) => !q || norm([o.name, o.type, o.country, o.notes].join(" ")).includes(q),
      );
      return { total: orgs.length, organizations: orgs };
    },
  },
  {
    name: "list_agenda",
    description: "Événements de l'agenda (RDV et tâches) sur une période.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD (défaut : aujourd'hui)" },
        to: { type: "string", description: "YYYY-MM-DD (défaut : +14 jours)" },
        includeDone: { type: "boolean" },
      },
    },
    async run(a) {
      const from = str(a.from) || today();
      const to = str(a.to) || new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      const events = (await all("agenda"))
        .filter((e) => String(e.date) >= from && String(e.date) <= to && (a.includeDone === true || !e.done))
        .sort((x, y) => `${x.date}${x.startTime}`.localeCompare(`${y.date}${y.startTime}`));
      return { from, to, total: events.length, events };
    },
  },
  {
    name: "list_meetings",
    description: "Comptes rendus de réunion (résumé, décisions, tâches), du plus récent au plus ancien.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number", description: "Défaut 10" } },
    },
    async run(a) {
      const q = norm(a.query);
      const meetings = (await all("meetings"))
        .filter((m) => !q || norm([m.title, m.summary, ...((m.participantNames as string[]) ?? [])].join(" ")).includes(q))
        .sort((x, y) => String(y.date).localeCompare(String(x.date)))
        .slice(0, Math.min(num(a.limit, 10), 50))
        .map((m) => ({
          id: m.id,
          title: m.title,
          date: m.date,
          participants: m.participantNames,
          summary: m.summary,
          decisions: m.decisions,
          tasks: m.tasks,
        }));
      return { meetings };
    },
  },
  {
    name: "list_loans",
    description: "Prêts de démonstration et envois de gants (en cours, rendus, envoyés).",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["out", "returned", "sent", "all"], description: "Défaut : out" } },
    },
    async run(a) {
      const status = str(a.status) || "out";
      const loans = (await all("loans")).filter((l) => status === "all" || l.status === status);
      return { total: loans.length, loans };
    },
  },
  {
    name: "get_stock",
    description: "Niveaux de stock des gants Netforce par modèle, couleur et taille.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    async run() {
      const stock = await all("stock");
      const total = stock.reduce((s, x) => s + num(x.qty, 0), 0);
      return { total, items: stock.map((x) => ({ type: x.type, color: x.color, size: x.size, qty: x.qty })) };
    },
  },
  {
    name: "list_dataroom_folders",
    description:
      "Liste les dossiers de la Data Room (nom, visibilité). Les fichiers eux-mêmes sont stockés dans le navigateur et ne sont pas accessibles ici.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    async run() {
      const folders = await all("dataroom_folders");
      return { folders: folders.map((f) => ({ name: f.name, visibility: f.visibility })) };
    },
  },
  {
    name: "get_team_activity",
    description:
      "Activité de l'équipe un jour donné (tracker desktop) : temps par application, sites web, documents, réunions Outlook, designs Canva.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD (défaut : aujourd'hui)" } } },
    async run(a) {
      const db = await teamDb();
      const date = str(a.date) || today();
      const [activity, users] = await Promise.all([
        getDocs(query(collection(db, "activity_tracker"), where("date", "==", date))),
        getDocs(collection(db, "users")),
      ]);
      const names = Object.fromEntries(
        users.docs.map((u) => [u.id, (u.data().name as string) || (u.data().email as string) || u.id]),
      );
      return {
        date,
        members: activity.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          return { ...x, userName: names[String(x.userId)] ?? x.userId };
        }),
      };
    },
  },
  {
    name: "get_activity_report",
    description: "Rapport d'activité (pointage des heures par tâche) sur une période, par personne.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD (défaut : il y a 7 jours)" },
        to: { type: "string", description: "YYYY-MM-DD (défaut : aujourd'hui)" },
      },
    },
    async run(a) {
      const db = await teamDb();
      const from = str(a.from) || new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const to = str(a.to) || today();
      const logs = await getDocs(
        query(collection(db, "logs"), where("date", ">=", from), where("date", "<=", to)),
      );
      const byPerson: Record<string, { hours: number; entries: unknown[] }> = {};
      for (const d of logs.docs) {
        const l = d.data() as Record<string, unknown>;
        const who = String(l.ownerName || l.ownerId || "?");
        byPerson[who] ??= { hours: 0, entries: [] };
        byPerson[who].hours += num(l.timeSpent, 0);
        byPerson[who].entries.push({
          date: l.date,
          task: l.taskName,
          category: l.taskCategory,
          hours: l.timeSpent,
          progress: l.progress,
          status: l.status,
        });
      }
      return { from, to, byPerson };
    },
  },

  // ── Écriture ───────────────────────────────────────────────
  {
    name: "create_contact",
    description: "Crée un nouveau contact dans le CRM. Vérifie d'abord avec search_contacts qu'il n'existe pas déjà.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: { type: "object", properties: contactFields, required: ["firstName", "lastName"] },
    async run(a) {
      const firstName = str(a.firstName);
      const lastName = str(a.lastName);
      if (!firstName || !lastName) throw new ToolError("Prénom et nom obligatoires.");
      checkStage(a.stage);
      checkFollowUp(a.nextFollowUpAt);
      const email = str(a.email).toLowerCase();
      if (email) {
        const dup = await getDocs(query(collection((await crmDb()), "contacts"), where("email", "==", email)));
        if (!dup.empty) {
          throw new ToolError(`Un contact existe déjà avec l'email ${email} (id : ${dup.docs[0].id}). Utilise update_contact.`);
        }
      }
      const t = now();
      const id = makeId("c");
      const contact = {
        firstName,
        lastName,
        email,
        phone: str(a.phone),
        company: str(a.company),
        category: str(a.category) || "Prospect",
        stage: str(a.stage) || "Nouveau",
        notes: str(a.notes),
        tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
        ...(optStr(a.country) ? { country: optStr(a.country) } : {}),
        ...(optStr(a.nextFollowUpAt) ? { nextFollowUpAt: optStr(a.nextFollowUpAt) } : {}),
        id,
        createdAt: t,
        updatedAt: t,
      };
      await setDoc(doc((await crmDb()), "contacts", id), contact);
      await logActivity(id, "note", "Contact créé par l'assistant IA", true);
      return { created: contactSummary(contact) };
    },
  },
  {
    name: "update_contact",
    description:
      "Modifie un contact existant (seuls les champs fournis changent). Un changement d'étape est journalisé dans son historique.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      properties: { contactId: { type: "string" }, ...contactFields },
      required: ["contactId"],
    },
    async run(a) {
      const id = str(a.contactId);
      const c = await one("contacts", id);
      if (!c) throw new ToolError(`Contact introuvable : ${id}`);
      checkStage(a.stage);
      checkFollowUp(a.nextFollowUpAt);
      const patch = pick(a, CONTACT_KEYS);
      if (typeof patch.email === "string") patch.email = patch.email.toLowerCase();
      if (patch.tags !== undefined) patch.tags = Array.isArray(patch.tags) ? patch.tags.map(String) : [];
      if (!Object.keys(patch).length) throw new ToolError("Aucun champ à modifier.");
      await updateDoc(doc((await crmDb()), "contacts", id), { ...patch, updatedAt: now() });
      if (patch.stage && patch.stage !== c.stage) {
        await logActivity(id, "stage", `Étape : ${c.stage} → ${patch.stage}`, true);
      }
      return { updated: id, changes: patch };
    },
  },
  {
    name: "add_contact_activity",
    description: "Ajoute une note, un appel, un email ou un RDV dans l'historique d'un contact.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        type: { type: "string", enum: ACTIVITY_TYPES, description: "Défaut : note" },
        text: { type: "string" },
      },
      required: ["contactId", "text"],
    },
    async run(a) {
      const id = str(a.contactId);
      const text = str(a.text);
      const type = str(a.type) || "note";
      if (!ACTIVITY_TYPES.includes(type)) throw new ToolError(`Type invalide. Valeurs : ${ACTIVITY_TYPES.join(", ")}`);
      if (!text) throw new ToolError("Texte obligatoire.");
      if (!(await one("contacts", id))) throw new ToolError(`Contact introuvable : ${id}`);
      await logActivity(id, type, text, false);
      return { added: { contactId: id, type, text } };
    },
  },
  {
    name: "create_agenda_event",
    description: "Ajoute un RDV ou une tâche dans l'agenda du CRM, éventuellement lié à un contact.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["rdv", "tache"] },
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:MM (optionnel)" },
        endTime: { type: "string", description: "HH:MM (optionnel)" },
        contactId: { type: "string" },
        notes: { type: "string" },
        visio: { type: "boolean" },
      },
      required: ["type", "title", "date"],
    },
    async run(a) {
      const type = str(a.type);
      const title = str(a.title);
      const date = str(a.date);
      if (!["rdv", "tache"].includes(type)) throw new ToolError("type doit être rdv ou tache.");
      if (!title) throw new ToolError("Titre obligatoire.");
      if (!isDateKey(date)) throw new ToolError("date doit être au format YYYY-MM-DD.");
      let contactName = "";
      const contactId = str(a.contactId);
      if (contactId) {
        const c = await one("contacts", contactId);
        if (!c) throw new ToolError(`Contact introuvable : ${contactId}`);
        contactName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      }
      const t = now();
      const id = makeId("e");
      const event = {
        id,
        type,
        title,
        date,
        startTime: str(a.startTime),
        endTime: str(a.endTime),
        contactId,
        contactName,
        notes: str(a.notes),
        visio: a.visio === true,
        done: false,
        createdAt: t,
        updatedAt: t,
      };
      await setDoc(doc((await crmDb()), "agenda", id), event);
      return { created: event };
    },
  },
  {
    name: "update_agenda_event",
    description: "Modifie un événement de l'agenda (ex. marquer une tâche comme faite, changer la date).",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        title: { type: "string" },
        date: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        notes: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["eventId"],
    },
    async run(a) {
      const id = str(a.eventId);
      if (!(await one("agenda", id))) throw new ToolError(`Événement introuvable : ${id}`);
      const patch = pick(a, ["title", "date", "startTime", "endTime", "notes", "done"]);
      if (patch.date !== undefined && !isDateKey(String(patch.date))) throw new ToolError("date doit être au format YYYY-MM-DD.");
      if (!Object.keys(patch).length) throw new ToolError("Aucun champ à modifier.");
      await updateDoc(doc((await crmDb()), "agenda", id), { ...patch, updatedAt: now() });
      return { updated: id, changes: patch };
    },
  },
  {
    name: "create_organization",
    description: "Crée une fiche organisation (ministère, police, distributeur, entreprise…).",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: {
          type: "string",
          description:
            "Ministère / Institution, Police, Gendarmerie, Armée / Défense, Sécurité privée, Distributeur / Revendeur, Entreprise, Autre",
        },
        country: { type: "string" },
        stage: { type: "string", enum: STAGES },
        notes: { type: "string" },
      },
      required: ["name"],
    },
    async run(a) {
      const name = str(a.name);
      if (!name) throw new ToolError("Nom obligatoire.");
      checkStage(a.stage);
      const t = now();
      const id = makeId("o");
      const org = {
        id,
        name,
        type: str(a.type) || "Autre",
        country: str(a.country),
        stage: str(a.stage),
        notes: str(a.notes),
        createdAt: t,
        updatedAt: t,
      };
      await setDoc(doc((await crmDb()), "organizations", id), org);
      return { created: org };
    },
  },
];

export async function callTool(name: string, args: Args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { isError: true, text: `Outil inconnu : ${name}` };
  try {
    const result = await tool.run(args ?? {});
    return { isError: false, text: JSON.stringify(result) };
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : `Erreur interne : ${e instanceof Error ? e.message : String(e)}`;
    return { isError: true, text: msg };
  }
}
