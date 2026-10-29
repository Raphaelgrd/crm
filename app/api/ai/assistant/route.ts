import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { TOOLS, ToolError, type ToolDef } from "@/lib/server/mcpTools";
import { assistantTools, type AssistantAction, type AssistantCtx, type Person } from "@/lib/server/assistantTools";

export const runtime = "nodejs";
export const maxDuration = 120;

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

function systemPrompt(me: Person, isAdmin: boolean) {
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  return `Tu es l'assistant du CRM de Netforce (gants tactiques pour forces de l'ordre et défense). Tu parles à ${me.name}, ${isAdmin ? "admin du CRM : tu peux lire ET modifier toutes les données" : "membre de l'équipe : tu peux lire les données et gérer ses propres tâches"}.
Nous sommes le ${today} (${iso}).

Règles :
- Réponds en français, de façon concise et concrète. Utilise des tirets pour les listes.
- Utilise TOUJOURS les outils pour lire les données avant de répondre ; n'invente jamais un contact, un chiffre ou un id.
- Avant de créer un contact, vérifie qu'il n'existe pas (search_contacts).
- Pour écrire un email à des contacts, utilise draft_email : l'utilisateur relira et enverra lui-même. Ne prétends jamais avoir envoyé un email.
- Pour un modèle réutilisable, utilise create_email_template.
- « Rappelle-moi de… », « ajoute une tâche… » → create_todo (dates au format YYYY-MM-DD, calculées à partir d'aujourd'hui).
- Après une modification, résume en une ligne ce que tu as fait.
- Pour envoyer l'utilisateur vers une page, utilise navigate.`;
}

// Groupes d'outils : on n'envoie au modèle que ceux utiles à la demande (limite de jetons/minute de Groq).
const GROUPS: { tools: string[]; keywords: RegExp }[] = [
  {
    tools: ["get_contact", "create_contact", "update_contact", "add_contact_activity", "list_follow_ups", "pipeline_summary", "list_organizations", "create_organization"],
    keywords: /contact|relan|pipeline|investiss|prospect|client|distribut|organisation|societe|categorie|etape|note|appel|fiche|lead/,
  },
  {
    tools: ["draft_email", "list_email_templates", "get_email_template", "create_email_template", "update_email_template"],
    keywords: /mail|message|modele|template|redige|ecri|newsletter|campagne|objet/,
  },
  { tools: ["list_todos", "create_todo", "update_todo"], keywords: /tache|rappel|todo|a faire|priorit|top 3|oublie/ },
  {
    tools: ["list_agenda", "create_agenda_event", "update_agenda_event"],
    keywords: /rdv|agenda|rendez|calendrier|planifi|semaine|demain|lundi|mardi|mercredi|jeudi|vendredi/,
  },
  { tools: ["get_team_activity", "get_activity_report"], keywords: /equipe|activite|heure|pointage|qui a|travaill|tracker|canva|journee/ },
  { tools: ["list_loans", "get_stock", "list_meetings"], keywords: /stock|gant|pret|envoi|echantillon|compte rendu|reunion|decision/ },
  { tools: ["list_dataroom_folders", "list_files_in_folder", "show_file"], keywords: /data ?room|fichier|dossier|document|pdf|plaquette|deck/ },
];
const CORE_TOOLS = ["search_contacts", "navigate"];
const DEFAULT_GROUPS = [0, 1, 2];

function pickTools(recentUserText: string): Set<string> {
  const t = recentUserText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matched = GROUPS.map((g, i) => (g.keywords.test(t) ? i : -1)).filter((i) => i >= 0);
  const names = new Set(CORE_TOOLS);
  for (const i of matched.length ? matched : DEFAULT_GROUPS) GROUPS[i].tools.forEach((n) => names.add(n));
  return names;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();

  const body = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    me?: Person;
    team?: Person[];
    files?: AssistantCtx["files"];
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY manquante" }, { status: 500 });
  const model = process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b";

  const me: Person = { uid: user.uid, name: body.me?.uid === user.uid ? body.me.name : user.email.split("@")[0] };
  const actions: AssistantAction[] = [];
  const ctx: AssistantCtx = {
    isAdmin: user.isAdmin,
    me,
    team: [me, ...(body.team ?? []).filter((p) => p.uid !== me.uid)],
    files: body.files ?? [],
    actions,
  };

  const recentUser = body.messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join(" ");
  const wanted = pickTools(recentUser);
  const tools: ToolDef[] = [
    ...TOOLS.filter((t) => user.isAdmin || t.annotations?.readOnlyHint),
    ...assistantTools(ctx),
  ].filter((t) => wanted.has(t.name));
  const groqTools = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const callGroq = async (msgs: Message[], attempt = 0): Promise<{ choices: [{ message: { content: string | null; tool_calls?: ToolCall[] } }] }> => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: msgs, tools: groqTools, tool_choice: "auto", max_tokens: 2000, temperature: 0.3 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429 && attempt < 2) {
      // Limite de jetons par minute : Groq indique le délai à attendre.
      const text = await res.text();
      const wait = Number(/try again in ([\d.]+)s/.exec(text)?.[1] ?? res.headers.get("retry-after") ?? 10);
      if (wait <= 45) {
        await sleep(Math.ceil(wait * 1000) + 500);
        return callGroq(msgs, attempt + 1);
      }
      throw new Error("Limite d'utilisation de l'IA atteinte, réessaie dans une minute.");
    }
    if (res.status === 429) throw new Error("Limite d'utilisation de l'IA atteinte, réessaie dans une minute.");
    if (!res.ok) throw new Error((await res.text()).slice(0, 300));
    return res.json() as Promise<{ choices: [{ message: { content: string | null; tool_calls?: ToolCall[] } }] }>;
  };

  const runTool = async (name: string, rawArgs: string) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return `Outil indisponible : ${name}${user.isAdmin ? "" : " (réservé aux admins)"}.`;
    try {
      const args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
      const out = JSON.stringify(await tool.run(args));
      return out.length > 6_000 ? `${out.slice(0, 6_000)}… (tronqué : précise ta recherche)` : out;
    } catch (e) {
      return e instanceof ToolError ? `Erreur : ${e.message}` : `Erreur interne : ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  try {
    const conversation: Message[] = [
      { role: "system", content: systemPrompt(me, user.isAdmin) },
      ...body.messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    ];
    for (let i = 0; i < 6; i++) {
      const msg = (await callGroq(conversation)).choices[0].message;
      if (msg.tool_calls?.length) {
        conversation.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          conversation.push({ role: "tool", tool_call_id: tc.id, content: await runTool(tc.function.name, tc.function.arguments) });
        }
        continue;
      }
      const reply = (msg.content ?? "").replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
      return Response.json({ reply, actions });
    }
    return Response.json({ reply: "Je n'ai pas pu terminer : la demande demande trop d'étapes. Reformule-la en plus petit.", actions });
  } catch (e) {
    return Response.json({ error: `Assistant indisponible : ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
