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

  const tools: ToolDef[] = [
    ...TOOLS.filter((t) => user.isAdmin || t.annotations?.readOnlyHint),
    ...assistantTools(ctx),
  ];
  const groqTools = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const callGroq = async (msgs: Message[]) => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: msgs, tools: groqTools, tool_choice: "auto", max_tokens: 3000, temperature: 0.3 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 300));
    return res.json() as Promise<{ choices: [{ message: { content: string | null; tool_calls?: ToolCall[] } }] }>;
  };

  const runTool = async (name: string, rawArgs: string) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return `Outil indisponible : ${name}${user.isAdmin ? "" : " (réservé aux admins)"}.`;
    try {
      const args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
      const out = JSON.stringify(await tool.run(args));
      return out.length > 14_000 ? `${out.slice(0, 14_000)}… (tronqué)` : out;
    } catch (e) {
      return e instanceof ToolError ? `Erreur : ${e.message}` : `Erreur interne : ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  try {
    const conversation: Message[] = [
      { role: "system", content: systemPrompt(me, user.isAdmin) },
      ...body.messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    ];
    for (let i = 0; i < 8; i++) {
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
