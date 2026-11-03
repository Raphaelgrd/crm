import { store } from "./store";
import { CONTRACTS, contractDataFromContact, findContract, type ContractData } from "./contracts";
import { GLOVE_COLORS, GLOVE_SIZES, GLOVE_TYPES, OperationError, createLoan, moveStock, returnLoan } from "./operations";
import { listFolders, updateFolder } from "./dataroom";
import { SHARE_DURATIONS, createGuestShare } from "./shares";
import {
  AutomationError,
  CATEGORIES as AUTO_CATEGORIES,
  STAGES as AUTO_STAGES,
  createAutomation,
  deleteAutomation,
  describeAutomation,
  getAutomation,
  listAutomations,
  patchAutomation,
  validateAutomation,
} from "./automations";
import { ToolError, type ToolDef } from "./mcpTools";

// Outils propres à l'Assistant IA du CRM (en plus de ceux du serveur MCP) :
// modèles d'email, tâches personnelles, brouillons d'email et navigation.

export type Person = { uid: string; name: string };
export type AssistantAction =
  | { type: "email_draft"; recipients: { id: string; email: string; firstName: string; lastName: string }[]; subject: string; body: string }
  | { type: "navigate"; path: string; label: string }
  | { type: "open_file" | "download_file"; fileId: string; name: string }
  | {
      type: "contract_draft";
      contractId: string;
      contractName: string;
      contactId: string;
      data: ContractData & { email: string };
      netforceSigner: { firstName: string; lastName: string; email: string } | null;
    };

export interface AssistantCtx {
  isAdmin: boolean;
  me: Person;
  team: Person[];
  files: { id: string; name: string; folder: string; size: number }[];
  actions: AssistantAction[];
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const now = () => new Date().toISOString();
const makeId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function blocksFrom(heading: string, paragraphs: string[], buttonLabel: string, buttonUrl: string) {
  const blocks: { id: string; type: string; props: Record<string, unknown> }[] = [];
  if (heading) blocks.push({ id: makeId("b"), type: "heading", props: { text: heading, align: "left", color: "#0f172a", fontSize: 24 } });
  for (const p of paragraphs.filter(Boolean)) {
    blocks.push({ id: makeId("b"), type: "text", props: { text: p, align: "left", color: "#334155", fontSize: 16 } });
  }
  if (buttonLabel && buttonUrl) {
    blocks.push({
      id: makeId("b"),
      type: "button",
      props: { label: buttonLabel, href: buttonUrl, bgColor: "#2563eb", textColor: "#ffffff", align: "center", radius: 8 },
    });
  }
  return blocks;
}

// Accès aux collections du CRM (compte de service en priorité, voir store.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;
const listCol = async (c: string) => (await (await store()).list(c)) as AnyDoc[];
const getOne = async (c: string, id: string) => (id ? ((await (await store()).get(c, id)) as AnyDoc | null) : null);
const setOne = async (c: string, id: string, d: AnyDoc) => (await store()).set(c, id, d);
const updateOne = async (c: string, id: string, d: AnyDoc) => (await store()).update(c, id, d);
const templateNames = async () => new Map((await listCol("templates")).map((t) => [String(t.id), String(t.name ?? t.id)]));

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com";

type ContentItem = { type?: string; text?: string; imageId?: string; alt?: string; label?: string; url?: string; width?: number };

/** Corps d'email bloc par bloc (titres, textes, images de la banque, boutons, séparateurs). */
async function blocksFromContent(items: ContentItem[]) {
  const blocks: { id: string; type: string; props: Record<string, unknown> }[] = [];
  for (const it of items) {
    const type = str(it.type);
    if (type === "heading" && str(it.text)) {
      blocks.push({ id: makeId("b"), type: "heading", props: { text: str(it.text), align: "left", color: "#0f172a", fontSize: 24 } });
    } else if (type === "text" && str(it.text)) {
      blocks.push({ id: makeId("b"), type: "text", props: { text: str(it.text), align: "left", color: "#334155", fontSize: 16 } });
    } else if (type === "image") {
      const id = str(it.imageId);
      const meta = await getOne("image_bank", id);
      if (!meta) throw new ToolError(`Image introuvable dans la banque : ${id}. Utilise list_images.`);
      blocks.push({
        id: makeId("b"),
        type: "image",
        props: {
          src: `${APP_URL}/api/images/${id}`,
          alt: str(it.alt) || meta.description || meta.name,
          width: Math.min(100, Math.max(20, Number(it.width) || 100)),
          align: "center",
          href: str(it.url),
        },
      });
    } else if (type === "button" && str(it.label) && str(it.url)) {
      blocks.push({
        id: makeId("b"),
        type: "button",
        props: { label: str(it.label), href: str(it.url), bgColor: "#2563eb", textColor: "#ffffff", align: "center", radius: 8 },
      });
    } else if (type === "divider") {
      blocks.push({ id: makeId("b"), type: "divider", props: { color: "#e2e8f0", thickness: 1 } });
    }
  }
  if (!blocks.length) throw new ToolError("content est vide ou invalide.");
  return blocks;
}

function templateText(t: Record<string, unknown>): string {
  if (t.type !== "Email") return String(t.plainText ?? "");
  const blocks = (t.blocks as { type: string; props: Record<string, unknown> }[]) ?? [];
  return blocks
    .map((b) =>
      b.type === "heading" || b.type === "text"
        ? String(b.props.text ?? "")
        : b.type === "button"
          ? `[Bouton] ${b.props.label} → ${b.props.href}`
          : b.type === "image"
            ? `[Image] ${b.props.alt || b.props.src}`
            : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

function resolvePerson(ctx: AssistantCtx, name: unknown): Person {
  const n = norm(str(name));
  if (!n || ["moi", "me", "toi"].includes(n)) return ctx.me;
  const p = ctx.team.find((x) => norm(x.name) === n || norm(x.name).split(/\s+/)[0] === n || norm(x.name).startsWith(n));
  if (!p) throw new ToolError(`Personne inconnue : ${name}. Équipe : ${ctx.team.map((x) => x.name).join(", ")}`);
  return p;
}

const templateFields = {
  content: {
    type: "array",
    description:
      "Corps bloc par bloc, dans l'ordre (prioritaire sur heading/paragraphs). Types : heading {text}, text {text}, image {imageId, alt?, width? en %, url? au clic}, button {label, url}, divider.",
    items: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["heading", "text", "image", "button", "divider"] },
        text: { type: "string" },
        imageId: { type: "string" },
        alt: { type: "string" },
        width: { type: "number" },
        label: { type: "string" },
        url: { type: "string" },
      },
      required: ["type"],
    },
  },
  name: { type: "string", description: "Nom du modèle" },
  subject: { type: "string", description: "Objet de l'email (variables possibles : {{firstName}}, {{companyName}}…)" },
  heading: { type: "string", description: "Titre affiché en haut de l'email (optionnel)" },
  paragraphs: { type: "array", items: { type: "string" }, description: "Paragraphes du corps, dans l'ordre" },
  buttonLabel: { type: "string" },
  buttonUrl: { type: "string" },
};

export function assistantTools(ctx: AssistantCtx): ToolDef[] {
  const adminOnly = (name: string) => {
    if (!ctx.isAdmin) throw new ToolError(`Action réservée aux admins (${name}).`);
  };
  return [
    {
      name: "list_email_templates",
      description: "Liste les modèles d'email, SMS et notes du CRM.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
      async run(a) {
        const q = norm(str(a.query));
        return {
          templates: (await listCol("templates"))
            .filter((t) => !q || norm(`${t.name} ${t.subject}`).includes(q))
            .map((t) => ({ id: t.id, name: t.name, type: t.type, subject: t.subject })),
        };
      },
    },
    {
      name: "get_email_template",
      description: "Contenu complet d'un modèle (objet et texte de chaque bloc).",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: { templateId: { type: "string" } }, required: ["templateId"] },
      async run(a) {
        const t = await getOne("templates", str(a.templateId));
        if (!t) throw new ToolError("Modèle introuvable.");
        return { id: t.id, name: t.name, type: t.type, subject: t.subject, content: templateText(t) };
      },
    },
    {
      name: "create_email_template",
      description:
        "Crée un modèle d'email réutilisable (éditable ensuite dans Templates). Pour un email illustré, cherche d'abord des visuels avec list_images puis utilise content. Variables possibles : {{firstName}}, {{lastName}}, {{companyName}}, {{email}}, {{phone}}, {{civility}}.",
      annotations: { readOnlyHint: false },
      inputSchema: { type: "object", properties: templateFields, required: ["name", "subject"] },
      async run(a) {
        adminOnly("create_email_template");
        const name = str(a.name);
        if (!name) throw new ToolError("Nom obligatoire.");
        const id = makeId("t");
        const t = now();
        await setOne("templates", id, {
          id,
          name,
          type: "Email",
          subject: str(a.subject),
          blocks: Array.isArray(a.content)
            ? await blocksFromContent(a.content as ContentItem[])
            : blocksFrom(str(a.heading), Array.isArray(a.paragraphs) ? a.paragraphs.map(String) : [], str(a.buttonLabel), str(a.buttonUrl)),
          settings: { bgColor: "#f1f5f9", contentBgColor: "#ffffff" },
          createdAt: t,
          updatedAt: t,
        });
        ctx.actions.push({ type: "navigate", path: `/templates/${id}`, label: `Ouvrir le modèle « ${name} »` });
        return { created: { id, name } };
      },
    },
    {
      name: "update_email_template",
      description: "Modifie un modèle d'email. Si content (ou paragraphs) est fourni, le corps est entièrement remplacé.",
      annotations: { readOnlyHint: false },
      inputSchema: { type: "object", properties: { templateId: { type: "string" }, ...templateFields }, required: ["templateId"] },
      async run(a) {
        adminOnly("update_email_template");
        const id = str(a.templateId);
        if (!(await getOne("templates", id))) throw new ToolError("Modèle introuvable.");
        const patch: Record<string, unknown> = { updatedAt: now() };
        if (a.name !== undefined) patch.name = str(a.name);
        if (a.subject !== undefined) patch.subject = str(a.subject);
        if (Array.isArray(a.content)) {
          patch.blocks = await blocksFromContent(a.content as ContentItem[]);
        } else if (Array.isArray(a.paragraphs)) {
          patch.blocks = blocksFrom(str(a.heading), a.paragraphs.map(String), str(a.buttonLabel), str(a.buttonUrl));
        }
        await updateOne("templates", id, patch);
        ctx.actions.push({ type: "navigate", path: `/templates/${id}`, label: "Ouvrir le modèle" });
        return { updated: id };
      },
    },
    {
      name: "list_images",
      description:
        "Cherche dans la banque d'images de Netforce (photos produits, visuels, logos…) à partir des noms, descriptions et tags. Renvoie les imageId à utiliser dans content.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Mots-clés (laisser vide pour tout lister)" }, tag: { type: "string" } },
      },
      async run(a) {
        const words = norm(str(a.query)).split(/\s+/).filter((w) => w.length > 2);
        const tag = norm(str(a.tag));
        const scored = (await listCol("image_bank"))
          .filter((i) => !tag || (i.tags ?? []).map(norm).includes(tag))
          .map((i) => {
            const hay = norm(`${i.name} ${i.description} ${(i.tags ?? []).join(" ")}`);
            return { i, score: words.length ? words.filter((w) => hay.includes(w)).length : 1 };
          })
          .filter((x) => x.score > 0)
          .sort((x, y) => y.score - x.score)
          .slice(0, 20);
        return {
          images: scored.map(({ i }) => ({
            imageId: i.id,
            name: i.name,
            description: i.description || "(pas de description)",
            tags: i.tags ?? [],
            format: `${i.width}x${i.height}`,
          })),
          note: scored.length ? undefined : "Aucune image correspondante : propose à l'utilisateur d'en ajouter dans Banque d'images.",
        };
      },
    },
    {
      name: "list_todos",
      description: "Tâches de « Mes tâches » d'une personne (par défaut l'utilisateur), triées par priorité puis échéance.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: {
          person: { type: "string", description: "Prénom d'un membre de l'équipe, ou « moi »" },
          includeDone: { type: "boolean" },
        },
      },
      async run(a) {
        const p = resolvePerson(ctx, a.person);
        const list = (await listCol("todos"))
          .filter((t) => t.ownerId === p.uid && (a.includeDone === true || t.status !== "done"))
          .sort((x, y) => x.priority - y.priority || String(x.due || "9999").localeCompare(String(y.due || "9999")))
          .map((t) => ({ id: t.id, title: t.title, priority: `P${t.priority}`, due: t.due || null, status: t.status, top3: t.focus }));
        return { person: p.name, todos: list };
      },
    },
    {
      name: "create_todo",
      description: "Ajoute une tâche dans « Mes tâches » (pour l'utilisateur ou un collègue).",
      annotations: { readOnlyHint: false },
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          priority: { type: "number", description: "1 critique, 2 haute, 3 normale (défaut), 4 basse" },
          due: { type: "string", description: "YYYY-MM-DD (optionnel)" },
          person: { type: "string", description: "Prénom du responsable (défaut : l'utilisateur)" },
          notes: { type: "string" },
          contactId: { type: "string", description: "Contact du CRM lié (optionnel)" },
        },
        required: ["title"],
      },
      async run(a) {
        const p = resolvePerson(ctx, a.person);
        if (p.uid !== ctx.me.uid) adminOnly("create_todo pour un collègue");
        const title = str(a.title);
        if (!title) throw new ToolError("Titre obligatoire.");
        const due = str(a.due);
        if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new ToolError("due doit être au format YYYY-MM-DD.");
        const priority = Math.min(4, Math.max(1, Math.round(Number(a.priority) || 3)));
        let contactName = "";
        const contactId = str(a.contactId);
        if (contactId) {
          const c = await getOne("contacts", contactId);
          if (c) contactName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
        }
        const id = makeId("td");
        const t = now();
        await setOne("todos", id, {
          id,
          title,
          notes: str(a.notes),
          ownerId: p.uid,
          ownerName: p.name,
          priority,
          due,
          status: "todo",
          focus: false,
          tags: [],
          contactId: contactName ? contactId : "",
          contactName,
          createdBy: ctx.me.uid,
          doneAt: "",
          createdAt: t,
          updatedAt: t,
        });
        return { created: { id, title, person: p.name, priority: `P${priority}`, due: due || null } };
      },
    },
    {
      name: "update_todo",
      description: "Modifie une tâche de « Mes tâches » (statut, priorité, échéance, titre, Top 3).",
      annotations: { readOnlyHint: false },
      inputSchema: {
        type: "object",
        properties: {
          todoId: { type: "string" },
          title: { type: "string" },
          status: { type: "string", enum: ["todo", "doing", "done"] },
          priority: { type: "number" },
          due: { type: "string" },
          top3: { type: "boolean" },
        },
        required: ["todoId"],
      },
      async run(a) {
        const todo = await getOne("todos", str(a.todoId));
        if (!todo) throw new ToolError("Tâche introuvable.");
        if (todo.ownerId !== ctx.me.uid) adminOnly("update_todo d'un collègue");
        const patch: Record<string, unknown> = { updatedAt: now() };
        if (a.title !== undefined) patch.title = str(a.title);
        if (a.status !== undefined) {
          patch.status = str(a.status);
          patch.doneAt = a.status === "done" ? now() : "";
        }
        if (a.priority !== undefined) patch.priority = Math.min(4, Math.max(1, Math.round(Number(a.priority))));
        if (a.due !== undefined) patch.due = str(a.due);
        if (a.top3 !== undefined) patch.focus = a.top3 === true;
        await updateOne("todos", str(a.todoId), patch);
        return { updated: str(a.todoId) };
      },
    },
    {
      name: "draft_email",
      description:
        "Prépare un email à un ou plusieurs contacts du CRM. RIEN n'est envoyé : l'utilisateur relit, modifie et clique sur « Envoyer ». Variables : {{prénom}}, {{nom}}.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: {
          contactIds: { type: "array", items: { type: "string" }, description: "Ids des contacts destinataires (via search_contacts)" },
          subject: { type: "string" },
          body: { type: "string", description: "Corps en texte, paragraphes séparés par une ligne vide" },
        },
        required: ["contactIds", "subject", "body"],
      },
      async run(a) {
        adminOnly("draft_email");
        const ids = Array.isArray(a.contactIds) ? a.contactIds.map(String).slice(0, 200) : [];
        const recipients = [];
        for (const id of ids) {
          const c = await getOne("contacts", id);
          if (c?.email) {
            recipients.push({ id, email: c.email, firstName: c.firstName ?? "", lastName: c.lastName ?? "" });
          }
        }
        if (!recipients.length) throw new ToolError("Aucun destinataire valide (contact introuvable ou sans email).");
        ctx.actions.push({ type: "email_draft", recipients, subject: str(a.subject), body: str(a.body) });
        return { drafted: true, recipients: recipients.length, note: "Brouillon affiché à l'utilisateur, en attente de son envoi." };
      },
    },
    {
      name: "prepare_contract",
      description: `Prépare un contrat Netforce rempli avec la fiche d'un contact, à envoyer pour signature électronique (Yousign). RIEN n'est envoyé : l'utilisateur vérifie, voit l'aperçu PDF et clique sur « Envoyer ». Contrats disponibles : ${CONTRACTS.map((c) => `${c.id} (${c.name})`).join(", ")}. Les champs fournis remplacent ceux de la fiche.`,
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: {
          contractId: { type: "string", description: "NDA ou MOU" },
          contactId: { type: "string", description: "Id du contact signataire (via search_contacts)" },
          email: { type: "string" },
          company: { type: "string" },
          jobTitle: { type: "string", description: "Fonction du signataire" },
          address: { type: "string", description: "Siège social de sa société" },
          registration: { type: "string", description: "Numéro d'immatriculation (RCS, SIREN…)" },
          representedBy: { type: "string" },
          shortName: { type: "string", description: "Nom court de la société dans le contrat (« ci-après dénommée »)" },
        },
        required: ["contractId", "contactId"],
      },
      async run(a) {
        adminOnly("prepare_contract");
        const id = str(a.contractId).toUpperCase();
        const contract = findContract(id);
        if (!contract) {
          throw new ToolError(
            `Le ${id || "contrat demandé"} n'est pas encore disponible dans le CRM. Contrats disponibles : ${CONTRACTS.map((c) => c.id).join(", ")}. Pour ajouter un modèle, il faut transmettre son PDF à l'équipe technique.`,
          );
        }
        const file = await getOne("contract_files", contract.id);
        if (!file?.data) {
          throw new ToolError(`Le modèle PDF du ${contract.id} n'est pas encore importé : un admin doit l'importer dans Documents légaux.`);
        }
        const c = await getOne("contacts", str(a.contactId));
        if (!c) throw new ToolError(`Contact introuvable : ${str(a.contactId)}. Utilise search_contacts.`);
        const data = contractDataFromContact(c);
        for (const k of ["email", "company", "jobTitle", "address", "registration", "representedBy", "shortName"] as const) {
          if (str(a[k])) data[k] = str(a[k]);
        }
        if (str(a.jobTitle) && !str(a.representedBy)) {
          data.representedBy = [[data.firstName, data.lastName].filter(Boolean).join(" "), data.jobTitle].filter(Boolean).join(", ");
        }
        if (str(a.company) && !str(a.shortName)) data.shortName = data.company;
        const netforceSigner = (file.netforceSigner as { firstName: string; lastName: string; email: string } | undefined) ?? null;
        ctx.actions.push({ type: "contract_draft", contractId: contract.id, contractName: contract.name, contactId: c.id, data, netforceSigner });
        const labels: Record<string, string> = {
          email: "email",
          company: "société",
          jobTitle: "fonction",
          address: "siège social",
          registration: "numéro d'immatriculation",
        };
        const missing = Object.entries(labels).filter(([k]) => !data[k as keyof typeof data]).map(([, l]) => l);
        return {
          prepared: contract.id,
          signer: `${data.firstName} ${data.lastName}`,
          company: data.company,
          missing,
          netforceSignerKnown: !!netforceSigner?.email,
          note: "Formulaire affiché à l'utilisateur : il complète si besoin, puis clique sur Envoyer. Rien n'est encore envoyé.",
        };
      },
    },
    {
      name: "list_signatures",
      description: "Liste les contrats (NDA, MOU) envoyés pour signature via Yousign et leur statut, éventuellement pour un contact.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          status: { type: "string", enum: ["ongoing", "done", "declined", "expired", "canceled"] },
        },
      },
      async run(a) {
        const all = (await listCol("signatures"))
          .filter((s) => (!str(a.contactId) || s.contactId === str(a.contactId)) && (!str(a.status) || s.status === str(a.status)))
          .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))
          .slice(0, 30);
        return {
          signatures: all.map((s) => ({
            contract: s.docType,
            title: s.title,
            contactId: s.contactId,
            status: s.status,
            sentAt: String(s.createdAt).slice(0, 10),
            signedAt: s.signedAt ? String(s.signedAt).slice(0, 10) : undefined,
            signers: (s.signers as { name: string; status: string }[]).map((x) => `${x.name} : ${x.status}`),
          })),
          note: "Statuts : ongoing = en attente, done = signé par tous, declined = refusé.",
        };
      },
    },
    {
      name: "list_automations",
      description: "Liste les automatisations du CRM (déclencheur, actions, active ou non, nombre d'exécutions).",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      async run() {
        const tpls = await templateNames();
        return {
          automations: (await listAutomations()).map((a) => ({
            id: a.id,
            name: a.name,
            active: a.active,
            runs: a.runs ?? 0,
            summary: describeAutomation(a, (id) => tpls.get(id) ?? id),
          })),
        };
      },
    },
    {
      name: "create_automation",
      description: `Crée une automatisation qui s'exécute toute seule.
Déclencheur (trigger) : type "contact_created" (nouveau contact : saisie, import, scan de carte, formulaire du site, assistant) ou "stage_changed" (changement d'étape ; stage = étape d'arrivée, "" = n'importe laquelle). category = ne concerne que cette catégorie de contact (facultatif).
Étapes : ${AUTO_STAGES.join(", ")}. Catégories : ${AUTO_CATEGORIES.join(", ")}.
Actions, exécutées dans l'ordre :
- send_email {templateId} : envoie automatiquement un modèle d'email au contact. Cherche l'id avec list_email_templates ; si le modèle n'existe pas, crée-le d'abord avec create_email_template.
- create_task {title, dueInDays} : tâche dans l'agenda, liée au contact, à J+dueInDays.
- set_stage {stage} ; set_category {category}.
Active par défaut (active=false pour la créer en pause).`,
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom court et clair" },
          description: { type: "string" },
          active: { type: "boolean" },
          trigger: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["contact_created", "stage_changed"] },
              stage: { type: "string" },
              category: { type: "string" },
            },
            required: ["type"],
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["send_email", "create_task", "set_stage", "set_category"] },
                templateId: { type: "string" },
                title: { type: "string" },
                dueInDays: { type: "number" },
                stage: { type: "string" },
                category: { type: "string" },
              },
              required: ["type"],
            },
          },
        },
        required: ["name", "trigger", "actions"],
      },
      async run(a) {
        adminOnly("create_automation");
        try {
          const created = await createAutomation(await validateAutomation(a));
          const tpls = await templateNames();
          ctx.actions.push({ type: "navigate", path: "/automatisation", label: "Voir les automatisations" });
          return {
            created: { id: created.id, name: created.name, active: created.active },
            summary: describeAutomation(created, (id) => tpls.get(id) ?? id),
            note: "Elle s'applique aux prochains événements, pas aux contacts déjà existants.",
          };
        } catch (e) {
          if (e instanceof AutomationError) throw new ToolError(e.message);
          throw e;
        }
      },
    },
    {
      name: "update_automation",
      description:
        "Modifie une automatisation (id via list_automations) : activer/désactiver (active), renommer, ou remplacer le déclencheur et/ou toutes les actions (mêmes formats que create_automation).",
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: {
          automationId: { type: "string" },
          active: { type: "boolean" },
          name: { type: "string" },
          description: { type: "string" },
          trigger: { type: "object" },
          actions: { type: "array", items: { type: "object" } },
        },
        required: ["automationId"],
      },
      async run(a) {
        adminOnly("update_automation");
        const current = await getAutomation(str(a.automationId));
        if (!current) throw new ToolError("Automatisation introuvable : utilise list_automations.");
        const { automationId: _id, ...changes } = a;
        if (!Object.keys(changes).length) throw new ToolError("Rien à modifier.");
        try {
          const onlyToggle = Object.keys(changes).every((k) => k === "active");
          const patch = onlyToggle ? { active: changes.active === true } : await validateAutomation({ ...current, ...changes });
          await patchAutomation(current.id, patch);
          return { updated: current.id, changes: Object.keys(changes) };
        } catch (e) {
          if (e instanceof AutomationError) throw new ToolError(e.message);
          throw e;
        }
      },
    },
    {
      name: "delete_automation",
      description: "Supprime définitivement une automatisation. Seulement si l'utilisateur le demande explicitement ; pour la mettre en pause, utilise update_automation avec active=false.",
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: { type: "object", properties: { automationId: { type: "string" } }, required: ["automationId"] },
      async run(a) {
        adminOnly("delete_automation");
        const current = await getAutomation(str(a.automationId));
        if (!current) throw new ToolError("Automatisation introuvable : utilise list_automations.");
        await deleteAutomation(current.id);
        return { deleted: current.name };
      },
    },
    {
      name: "adjust_stock",
      description: `Entrée (réception, fabrication) ou sortie (vente, casse) de gants dans le stock. Modèles : ${GLOVE_TYPES.join(", ")} ; coloris : ${GLOVE_COLORS.join(", ")} ; tailles : ${GLOVE_SIZES.join(", ")}. Une sortie supérieure au stock est refusée. Pour un prêt ou un envoi à un contact, utilise plutôt create_loan.`,
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...GLOVE_TYPES] },
          color: { type: "string", enum: [...GLOVE_COLORS] },
          size: { type: "string", enum: [...GLOVE_SIZES] },
          qty: { type: "number", description: "Nombre de paires (entier > 0)" },
          direction: { type: "string", enum: ["in", "out"], description: "in = entrée, out = sortie" },
          note: { type: "string", description: "Motif (ex. réception commande usine)" },
        },
        required: ["type", "color", "size", "qty", "direction"],
      },
      async run(a) {
        adminOnly("adjust_stock");
        try {
          const r = await moveStock({
            type: str(a.type),
            color: str(a.color),
            size: str(a.size),
            qty: Number(a.qty),
            direction: str(a.direction) === "in" ? "in" : "out",
            note: str(a.note),
          });
          return { stock: r.label, before: r.before, after: r.after };
        } catch (e) {
          if (e instanceof OperationError) throw new ToolError(e.message);
          throw e;
        }
      },
    },
    {
      name: "create_loan",
      description:
        "Enregistre un prêt de démonstration (kind=loan, le gant revient ; dueAt = date de retour YYYY-MM-DD) ou un envoi définitif (kind=shipment : échantillon, commande) de gants à un contact (id via search_contacts). Sort du stock par défaut (fromStock=false si les gants ne viennent pas du stock suivi). Noté dans l'historique du contact.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          kind: { type: "string", enum: ["loan", "shipment"] },
          type: { type: "string", enum: [...GLOVE_TYPES] },
          color: { type: "string", enum: [...GLOVE_COLORS] },
          size: { type: "string", enum: [...GLOVE_SIZES] },
          qty: { type: "number" },
          dueAt: { type: "string", description: "Retour prévu YYYY-MM-DD (prêt uniquement)" },
          notes: { type: "string" },
          fromStock: { type: "boolean", description: "Défaut : true" },
        },
        required: ["contactId", "kind", "type", "color", "size", "qty"],
      },
      async run(a) {
        adminOnly("create_loan");
        try {
          const loan = await createLoan({
            contactId: str(a.contactId),
            kind: str(a.kind) === "shipment" ? "shipment" : "loan",
            type: str(a.type),
            color: str(a.color),
            size: str(a.size),
            qty: Number(a.qty),
            dueAt: str(a.dueAt),
            notes: str(a.notes),
            fromStock: a.fromStock !== false,
          });
          ctx.actions.push({ type: "navigate", path: "/prets", label: "Voir les prêts & envois" });
          return { created: { id: loan.id, contact: loan.contactName, kind: loan.kind, qty: loan.qty, dueAt: loan.dueAt || undefined } };
        } catch (e) {
          if (e instanceof OperationError) throw new ToolError(e.message);
          throw e;
        }
      },
    },
    {
      name: "return_loan",
      description: "Enregistre le retour d'un prêt en cours (id via list_loans), avec le retour terrain du contact ; remet les gants en stock s'ils en étaient sortis.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: { loanId: { type: "string" }, feedback: { type: "string", description: "Retour terrain (avis, résultats d'essai)" } },
        required: ["loanId"],
      },
      async run(a) {
        adminOnly("return_loan");
        try {
          const loan = await returnLoan(str(a.loanId), str(a.feedback));
          return { returned: loan.id, contact: loan.contactName, backInStock: !!loan.stockLinked };
        } catch (e) {
          if (e instanceof OperationError) throw new ToolError(e.message);
          throw e;
        }
      },
    },
    {
      name: "share_dataroom",
      description: `Donne à une personne extérieure un accès temporaire à une Data Room (nom via list_dataroom_folders) : elle reçoit un lien par email, son compte invité est créé à la première visite, elle ne voit que cette Data Room. Durées possibles (jours) : ${SHARE_DURATIONS.join(", ")}. L'email part immédiatement : vérifie l'adresse (search_contacts) et la Data Room avec l'utilisateur avant d'appeler.`,
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: {
          dataRoom: { type: "string", description: "Nom exact de la Data Room" },
          email: { type: "string" },
          days: { type: "number", description: "Durée d'accès en jours (défaut 7)" },
          message: { type: "string", description: "Message personnel ajouté à l'invitation (facultatif)" },
        },
        required: ["dataRoom", "email"],
      },
      async run(a) {
        adminOnly("share_dataroom");
        const email = str(a.email).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError("Adresse email invalide.");
        const days = a.days === undefined ? 7 : Number(a.days);
        if (!SHARE_DURATIONS.includes(days)) throw new ToolError(`Durée possible : ${SHARE_DURATIONS.join(", ")} jours.`);
        const folder = (await listFolders()).find((f) => norm(f.name) === norm(str(a.dataRoom)));
        if (!folder) throw new ToolError(`Data Room introuvable : « ${str(a.dataRoom)} ». Utilise list_dataroom_folders.`);
        const r = await createGuestShare({ folder, email, days, message: str(a.message).slice(0, 1000), senderName: ctx.me.name || "L'équipe Netforce", senderEmail: "" });
        return {
          shared: folder.name,
          with: email,
          until: r.share.expiresAt.slice(0, 10),
          emailed: r.emailed,
          ...(r.emailed ? {} : { emailError: r.emailError, link: r.url, note: "L'email n'est pas parti : donne ce lien à l'utilisateur pour qu'il le transmette." }),
        };
      },
    },
    {
      name: "set_dataroom_visibility",
      description: "Rend une Data Room publique (visible par toute l'équipe) ou privée (admins et invités uniquement).",
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: { dataRoom: { type: "string" }, visibility: { type: "string", enum: ["public", "private"] } },
        required: ["dataRoom", "visibility"],
      },
      async run(a) {
        adminOnly("set_dataroom_visibility");
        const folder = (await listFolders()).find((f) => norm(f.name) === norm(str(a.dataRoom)));
        if (!folder) throw new ToolError(`Data Room introuvable : « ${str(a.dataRoom)} ». Utilise list_dataroom_folders.`);
        const visibility = str(a.visibility) === "private" ? "private" : "public";
        await updateFolder(folder.id, { visibility });
        return { dataRoom: folder.name, visibility };
      },
    },
    {
      name: "list_files_in_folder",
      description: "Liste les fichiers d'une Data Room ou d'un sous-dossier (fichiers de ce navigateur).",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: { folderPath: { type: "string" } }, required: ["folderPath"] },
      async run(a) {
        const fp = str(a.folderPath);
        const direct = ctx.files.filter((f) => f.folder === fp);
        const sub = [...new Set(ctx.files.filter((f) => f.folder.startsWith(fp + "/")).map((f) => f.folder.slice(fp.length + 1).split("/")[0]))];
        return { files: direct.map((f) => ({ id: f.id, name: f.name, sizeKo: Math.round(f.size / 1024) })), subfolders: sub };
      },
    },
    {
      name: "show_file",
      description: "Propose à l'utilisateur d'ouvrir ou de télécharger un fichier de la Data Room.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: { fileId: { type: "string" }, mode: { type: "string", enum: ["open", "download"] } },
        required: ["fileId"],
      },
      async run(a) {
        const f = ctx.files.find((x) => x.id === str(a.fileId));
        if (!f) throw new ToolError("Fichier introuvable dans la Data Room de ce navigateur.");
        ctx.actions.push({ type: str(a.mode) === "download" ? "download_file" : "open_file", fileId: f.id, name: f.name });
        return { ok: true };
      },
    },
    {
      name: "navigate",
      description:
        "Propose un bouton pour ouvrir une page du CRM : /automatisation, /documents, /contacts, /investisseurs, /closing, /organisations, /taches, /agenda, /emails, /templates, /comptes-rendus, /stock, /prets, /data-room, /equipe, /rapport, /analytics.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, label: { type: "string" } },
        required: ["path"],
      },
      async run(a) {
        const path = str(a.path);
        if (!path.startsWith("/") || path.startsWith("//")) throw new ToolError("Chemin invalide.");
        ctx.actions.push({ type: "navigate", path, label: str(a.label) || `Ouvrir ${path}` });
        return { ok: true };
      },
    },
  ];
}
