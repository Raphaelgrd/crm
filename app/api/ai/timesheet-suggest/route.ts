import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { GroqError, groqChat } from "@/lib/server/groq";
import { activityText, type TrackerDoc } from "@/lib/server/activityText";

export const runtime = "nodejs";

interface TaskIn {
  id: string;
  name: string;
  category: string;
  description?: string;
}

const SYSTEM = `Tu prépares le pointage d'heures du jour d'un membre de l'équipe Netforce à partir de son tracker d'activité.
On te donne ses tâches actives et son activité. Réponds UNIQUEMENT en JSON :
{"suggestions":[{"taskId":"…","hours":1.5,"reason":"…"}],"newTasks":[{"name":"…","category":"…","hours":1,"reason":"…"}]}
Règles :
- Répartis le temps actif réel entre ses tâches existantes quand l'activité y correspond (nom, catégorie, documents, outils).
- Pour une activité importante (≥ 30 min) qui ne correspond à aucune tâche, propose une nouvelle tâche dans newTasks, avec une catégorie choisie dans la liste fournie.
- Heures arrondies à 0,5 près, au moins 0,5. Le total ne dépasse pas le temps actif.
- N'utilise que des taskId fournis. N'invente pas d'activité absente des données.
- "reason" : une phrase courte en français qui cite les éléments concrets (documents, sites, applis).`;

const round = (h: number) => Math.max(0.5, Math.round(h * 2) / 2);

export async function POST(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const { activity, tasks, categories } = (await req.json()) as {
    activity: TrackerDoc;
    tasks: TaskIn[];
    categories: string[];
  };
  const activeMin = Math.round((activity?.active ?? 0) / 60);
  if (activeMin < 15) {
    return Response.json({ suggestions: [], newTasks: [], note: "Moins de 15 min d'activité suivie aujourd'hui." });
  }

  const taskList = (tasks ?? [])
    .slice(0, 60)
    .map((t) => `- id=${t.id} | ${t.name} | ${t.category}${t.description ? ` | ${t.description.slice(0, 120)}` : ""}`)
    .join("\n");

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user: `Catégories possibles : ${(categories ?? []).join(", ")}\n\nTâches actives :\n${taskList || "(aucune)"}\n\nActivité du jour :\n${activityText(activity)}`,
      json: true,
      maxTokens: 900,
      temperature: 0.2,
    });
    const parsed = JSON.parse(raw) as {
      suggestions?: { taskId?: string; hours?: number; reason?: string }[];
      newTasks?: { name?: string; category?: string; hours?: number; reason?: string }[];
    };
    const ids = new Set((tasks ?? []).map((t) => t.id));
    const cats = new Set(categories ?? []);
    const suggestions = (parsed.suggestions ?? [])
      .filter((s) => s.taskId && ids.has(s.taskId) && Number(s.hours) > 0)
      .map((s) => ({ taskId: s.taskId!, hours: round(Number(s.hours)), reason: String(s.reason ?? "") }));
    const newTasks = (parsed.newTasks ?? [])
      .filter((n) => n.name && Number(n.hours) > 0)
      .map((n) => ({
        name: String(n.name).slice(0, 120),
        category: cats.has(String(n.category)) ? String(n.category) : "Autre",
        hours: round(Number(n.hours)),
        reason: String(n.reason ?? ""),
      }));
    return Response.json({ suggestions, newTasks, activeMinutes: activeMin });
  } catch (e) {
    return Response.json({ error: e instanceof GroqError ? e.message : "Suggestion impossible." }, { status: 502 });
  }
}
