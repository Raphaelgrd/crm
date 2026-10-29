import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore/lite";
import { crmDb } from "./db";
import { ToolError, type ToolDef } from "./mcpTools";

// Outils propres à l'Assistant IA du CRM (en plus de ceux du serveur MCP) :
// modèles d'email, tâches personnelles, brouillons d'email et navigation.

export type Person = { uid: string; name: string };
export type AssistantAction =
  | { type: "email_draft"; recipients: { id: string; email: string; firstName: string; lastName: string }[]; subject: string; body: string }
  | { type: "navigate"; path: string; label: string }
  | { type: "open_file" | "download_file"; fileId: string; name: string };

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

function templateText(t: Record<string, unknown>): string {
  if (t.type !== "Email") return String(t.plainText ?? "");
  const blocks = (t.blocks as { type: string; props: Record<string, unknown> }[]) ?? [];
  return blocks
    .map((b) =>
      b.type === "heading" || b.type === "text"
        ? String(b.props.text ?? "")
        : b.type === "button"
          ? `[Bouton] ${b.props.label} → ${b.props.href}`
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
        const snap = await getDocs(collection(await crmDb(), "templates"));
        return {
          templates: snap.docs
            .map((d) => d.data())
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
        const snap = await getDoc(doc(await crmDb(), "templates", str(a.templateId)));
        if (!snap.exists()) throw new ToolError("Modèle introuvable.");
        const t = snap.data();
        return { id: t.id, name: t.name, type: t.type, subject: t.subject, content: templateText(t) };
      },
    },
    {
      name: "create_email_template",
      description:
        "Crée un modèle d'email réutilisable (éditable ensuite dans Templates). Variables possibles : {{firstName}}, {{lastName}}, {{companyName}}, {{email}}, {{phone}}, {{civility}}.",
      annotations: { readOnlyHint: false },
      inputSchema: { type: "object", properties: templateFields, required: ["name", "subject", "paragraphs"] },
      async run(a) {
        adminOnly("create_email_template");
        const name = str(a.name);
        if (!name) throw new ToolError("Nom obligatoire.");
        const id = makeId("t");
        const t = now();
        await setDoc(doc(await crmDb(), "templates", id), {
          id,
          name,
          type: "Email",
          subject: str(a.subject),
          blocks: blocksFrom(str(a.heading), Array.isArray(a.paragraphs) ? a.paragraphs.map(String) : [], str(a.buttonLabel), str(a.buttonUrl)),
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
      description: "Modifie un modèle d'email. Si paragraphs est fourni, le corps est entièrement remplacé.",
      annotations: { readOnlyHint: false },
      inputSchema: { type: "object", properties: { templateId: { type: "string" }, ...templateFields }, required: ["templateId"] },
      async run(a) {
        adminOnly("update_email_template");
        const id = str(a.templateId);
        const ref = doc(await crmDb(), "templates", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new ToolError("Modèle introuvable.");
        const patch: Record<string, unknown> = { updatedAt: now() };
        if (a.name !== undefined) patch.name = str(a.name);
        if (a.subject !== undefined) patch.subject = str(a.subject);
        if (Array.isArray(a.paragraphs)) {
          patch.blocks = blocksFrom(str(a.heading), a.paragraphs.map(String), str(a.buttonLabel), str(a.buttonUrl));
        }
        await updateDoc(ref, patch);
        ctx.actions.push({ type: "navigate", path: `/templates/${id}`, label: "Ouvrir le modèle" });
        return { updated: id };
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
        const snap = await getDocs(collection(await crmDb(), "todos"));
        const list = snap.docs
          .map((d) => d.data())
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
          const c = await getDoc(doc(await crmDb(), "contacts", contactId));
          if (c.exists()) contactName = `${c.data().firstName ?? ""} ${c.data().lastName ?? ""}`.trim();
        }
        const id = makeId("td");
        const t = now();
        await setDoc(doc(await crmDb(), "todos", id), {
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
        const ref = doc(await crmDb(), "todos", str(a.todoId));
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new ToolError("Tâche introuvable.");
        if (snap.data().ownerId !== ctx.me.uid) adminOnly("update_todo d'un collègue");
        const patch: Record<string, unknown> = { updatedAt: now() };
        if (a.title !== undefined) patch.title = str(a.title);
        if (a.status !== undefined) {
          patch.status = str(a.status);
          patch.doneAt = a.status === "done" ? now() : "";
        }
        if (a.priority !== undefined) patch.priority = Math.min(4, Math.max(1, Math.round(Number(a.priority))));
        if (a.due !== undefined) patch.due = str(a.due);
        if (a.top3 !== undefined) patch.focus = a.top3 === true;
        await updateDoc(ref, patch);
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
        const db = await crmDb();
        const recipients = [];
        for (const id of ids) {
          const c = await getDoc(doc(db, "contacts", id));
          if (c.exists() && c.data().email) {
            recipients.push({ id, email: c.data().email, firstName: c.data().firstName ?? "", lastName: c.data().lastName ?? "" });
          }
        }
        if (!recipients.length) throw new ToolError("Aucun destinataire valide (contact introuvable ou sans email).");
        ctx.actions.push({ type: "email_draft", recipients, subject: str(a.subject), body: str(a.body) });
        return { drafted: true, recipients: recipients.length, note: "Brouillon affiché à l'utilisateur, en attente de son envoi." };
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
        "Propose un bouton pour ouvrir une page du CRM : /contacts, /investisseurs, /closing, /organisations, /taches, /agenda, /emails, /templates, /comptes-rendus, /stock, /prets, /data-room, /equipe, /rapport, /analytics.",
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
