import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";

export const runtime = "nodejs";

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

const SYSTEM = `Tu es l'assistant intelligent du CRM Netforce. Tu aides l'équipe à naviguer, trouver des informations et agir sur le CRM.

Tu as accès aux outils suivants pour lire les données du CRM. Utilise-les TOUJOURS avant de répondre à une question sur les données (contacts, dossiers, fichiers, pipeline).

Règles :
- Réponds toujours en français
- Sois concis et direct
- Quand tu listes des résultats, utilise des tirets
- Pour naviguer vers une page, retourne un bloc JSON à la fin : {"action":"navigate","path":"/contacts"}
- Pour ouvrir un fichier, retourne : {"action":"open_file","fileId":"xxx"}
- Pour télécharger un fichier, retourne : {"action":"download_file","fileId":"xxx"}`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Recherche des contacts dans le CRM par nom, société, email, catégorie ou étape pipeline.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texte de recherche (nom, société, email, tag…)" },
          category: { type: "string", description: "Filtrer par catégorie (Prospect, Client, Investisseur…)" },
          stage: { type: "string", description: "Filtrer par étape pipeline" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contact_detail",
      description: "Récupère toutes les informations d'un contact spécifique.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "ID du contact" },
        },
        required: ["contactId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dataroom_folders",
      description: "Liste toutes les Data Rooms disponibles avec leur statut (public/privé) et nombre de fichiers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files_in_folder",
      description: "Liste les fichiers d'une Data Room ou d'un sous-dossier.",
      parameters: {
        type: "object",
        properties: {
          folderPath: { type: "string", description: "Chemin du dossier (ex: 'Kit Marketing FR' ou 'Kit Marketing FR/Brochures')" },
        },
        required: ["folderPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Retourne un résumé du pipeline commercial (nombre de contacts par étape).",
      parameters: { type: "object", properties: {} },
    },
  },
];

export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const { messages, crmContext } = (await req.json()) as {
    messages: Message[];
    crmContext: {
      contacts: Array<{ id: string; firstName: string; lastName: string; email: string; company: string; category: string; stage: string; tags?: string[]; notes?: string; nextFollowUpAt?: string }>;
      folders: Array<{ name: string; visibility: string; fileCount: number }>;
      files: Array<{ id: string; name: string; folder: string; size: number; mime: string; createdAt: string }>;
    };
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY manquante" }, { status: 500 });
  const model = process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b";

  const callGroq = async (msgs: Message[]) => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: msgs, tools: TOOLS, tool_choice: "auto", max_tokens: 2048, temperature: 0.3 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ choices: [{ message: { role: string; content: string | null; tool_calls?: ToolCall[] }; finish_reason: string }] }>;
  };

  // Tool execution (uses the crmContext passed from client)
  const executeTool = (name: string, args: Record<string, string>): string => {
    if (name === "search_contacts") {
      const q = (args.query ?? "").toLowerCase();
      const cat = (args.category ?? "").toLowerCase();
      const stage = (args.stage ?? "").toLowerCase();
      const results = crmContext.contacts.filter((c) => {
        const text = `${c.firstName} ${c.lastName} ${c.email} ${c.company} ${(c.tags ?? []).join(" ")}`.toLowerCase();
        return (!q || text.includes(q)) && (!cat || c.category.toLowerCase().includes(cat)) && (!stage || c.stage.toLowerCase().includes(stage));
      });
      if (!results.length) return "Aucun contact trouvé.";
      return results.slice(0, 15).map((c) => `- ${c.firstName} ${c.lastName} | ${c.company || "—"} | ${c.category} | ${c.stage} | id:${c.id}`).join("\n");
    }

    if (name === "get_contact_detail") {
      const c = crmContext.contacts.find((x) => x.id === args.contactId);
      if (!c) return "Contact introuvable.";
      return JSON.stringify({ ...c, relance: c.nextFollowUpAt ?? "non planifiée" }, null, 2);
    }

    if (name === "list_dataroom_folders") {
      if (!crmContext.folders.length) return "Aucune Data Room.";
      return crmContext.folders.map((f) => `- ${f.name} (${f.visibility}) — ${f.fileCount} fichier(s)`).join("\n");
    }

    if (name === "list_files_in_folder") {
      const fp = args.folderPath ?? "";
      const direct = crmContext.files.filter((f) => f.folder === fp);
      const sub = crmContext.files.filter((f) => f.folder.startsWith(fp + "/"));
      if (!direct.length && !sub.length) return `Aucun fichier dans "${fp}".`;
      const lines = [
        ...direct.map((f) => `- [fichier] ${f.name} (${(f.size / 1024).toFixed(0)} Ko) id:${f.id}`),
        ...Array.from(new Set(sub.map((f) => f.folder.slice(fp.length + 1).split("/")[0]))).map((d) => `- [dossier] ${d}`),
      ];
      return lines.join("\n");
    }

    if (name === "get_pipeline_summary") {
      const byStage: Record<string, number> = {};
      for (const c of crmContext.contacts) byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
      return Object.entries(byStage).map(([s, n]) => `- ${s} : ${n} contact(s)`).join("\n");
    }

    return "Outil inconnu.";
  };

  try {
    const conversationMsgs: Message[] = [{ role: "system", content: SYSTEM }, ...messages];

    // Agentic loop (max 5 tool calls)
    for (let i = 0; i < 5; i++) {
      const data = await callGroq(conversationMsgs);
      const msg = data.choices[0].message;

      if (msg.tool_calls?.length) {
        conversationMsgs.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          const args = JSON.parse(tc.function.arguments) as Record<string, string>;
          const result = executeTool(tc.function.name, args);
          conversationMsgs.push({ role: "tool", content: result, tool_call_id: tc.id });
        }
        continue;
      }

      return Response.json({ reply: (msg.content ?? "").replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim() });
    }

    return Response.json({ reply: "Je n'ai pas pu terminer la recherche." });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
