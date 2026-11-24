import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { budgetStatus, monthKey, setBudget, usageForMonth } from "@/lib/server/aiUsage";
import { store } from "@/lib/server/store";
import data from "@/lib/siege/data.json";

// « Historique IA » : utilisation de l'IA du CRM par toute l'équipe (lecture : membres ; plafond : admins).
export const runtime = "nodejs";

const AGENTS: Record<string, string> = Object.fromEntries(
  ((data as { A: { id: string; name: string; role: string }[] }).A ?? []).map((a) => [a.id, `${a.name} (${a.role})`]),
);
AGENTS.chef ??= "Victor (chef d'orchestre)";

export async function GET(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  const q = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(q) ? q : monthKey();
  try {
    const [usage, budget, months] = await Promise.all([
      usageForMonth(month),
      budgetStatus(true),
      (async () => (await (await store()).list("aiUsageMonth")).map((m) => ({ month: String(m.id), costUsd: Number(m.costUsd ?? 0), calls: Number(m.calls ?? 0) })))(),
    ]);
    const entries = usage.entries.map((e) => ({ ...e, agentName: e.agent ? (AGENTS[e.agent] ?? e.agent) : null }));
    months.sort((a, b) => b.month.localeCompare(a.month));
    return Response.json({ month, ...usage, entries, budget, months, isAdmin: user.isAdmin });
  } catch (e) {
    return Response.json({ error: `Historique illisible : ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

/** Plafond mensuel de dépense pour Claude (dollars), réservé aux admins. */
export async function PATCH(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Réservé aux admins." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { budgetUsd?: unknown };
  const b = Number(body.budgetUsd);
  if (!Number.isFinite(b) || b < 0 || b > 1000) return Response.json({ error: "Plafond invalide (entre 0 et 1 000 $)." }, { status: 400 });
  await setBudget(Math.round(b * 100) / 100, user.email);
  return Response.json({ ok: true, budget: await budgetStatus(true) });
}
