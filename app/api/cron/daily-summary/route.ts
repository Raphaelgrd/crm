import { NextRequest } from "next/server";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore/lite";
import { Resend } from "resend";
import { rapportDb } from "@/lib/server/db";
import { apiKeyOk, safeEqual } from "@/lib/server/apiKey";
import { groqChat } from "@/lib/server/groq";
import { SUMMARY_SYSTEM, activityText, type TrackerDoc } from "@/lib/server/activityText";
import { escapeHtml } from "@/lib/escapeHtml";

// Tâche planifiée (vercel.json) : résume la journée de chaque membre et envoie le rapport par email.
// Vercel l'appelle avec `Authorization: Bearer $CRON_SECRET` ; on peut aussi la lancer avec la clé d'API.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const parisDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

function cronOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  return (!!secret && safeEqual(auth, `Bearer ${secret}`)) || apiKeyOk(req, { allowQuery: true });
}

export async function GET(req: NextRequest) {
  if (!cronOk(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const r = await rapportDb();
  if (!r) return Response.json({ error: "CRM_API_KEY non configurée." }, { status: 500 });

  const date = req.nextUrl.searchParams.get("date") || parisDate();
  const [activity, users] = await Promise.all([
    getDocs(query(collection(r.db, "activity_tracker"), where("date", "==", date))),
    getDocs(collection(r.db, "users")),
  ]);
  const names = Object.fromEntries(
    users.docs.map((u) => [u.id, (u.data().name as string) || (u.data().email as string) || u.id]),
  );

  const results: { name: string; summary: string; activeMin: number }[] = [];
  for (const d of activity.docs) {
    const t = d.data() as TrackerDoc & { userId: string };
    const name = names[t.userId] ?? t.userId;
    const activeMin = Math.round((t.active ?? 0) / 60);
    if (activeMin < 10) continue;
    try {
      const summary = await groqChat({
        system: SUMMARY_SYSTEM,
        user: `Personne : ${name}\nDate : ${date}\n\n${activityText(t)}`,
        maxTokens: 350,
      });
      await setDoc(doc(r.db, "activity_summaries", `${t.userId}_${date}`), {
        userId: t.userId,
        date,
        summary,
        generatedAt: new Date().toISOString(),
      });
      results.push({ name, summary, activeMin });
    } catch {
      results.push({ name, summary: "(résumé indisponible)", activeMin });
    }
  }

  const to = (process.env.DAILY_REPORT_TO ?? "gerardraphael01@gmail.com").split(",").map((e) => e.trim()).filter(Boolean);
  let emailed = false;
  if (process.env.RESEND_API_KEY && to.length) {
    const label = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const body = results.length
      ? results
          .map(
            (x) =>
              `<h3 style="margin:20px 0 4px;font-size:15px">${escapeHtml(x.name)} <span style="color:#888;font-weight:normal">· ${Math.floor(x.activeMin / 60)}h${String(x.activeMin % 60).padStart(2, "0")} d'activité</span></h3><p style="margin:0;line-height:1.5">${escapeHtml(x.summary)}</p>`,
          )
          .join("")
      : "<p>Aucune activité suivie aujourd'hui.</p>";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.netforce-defense.com";
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "CRM Netforce <contact@mail.netforce-defense.com>",
      to,
      subject: `Rapport d'activité de l'équipe — ${label}`,
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;color:#111"><h2 style="margin:0 0 8px">Activité de l'équipe — ${escapeHtml(label)}</h2>${body}<p style="margin-top:24px"><a href="${appUrl}/equipe">Voir le détail dans le CRM</a></p></div>`,
    });
    emailed = true;
  }

  return Response.json({ date, summarized: results.length, emailed });
}
