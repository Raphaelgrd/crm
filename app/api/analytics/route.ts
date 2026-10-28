import { NextRequest } from "next/server";
import { ga4Configured, runReport, type Row } from "@/lib/ga4";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";

// Rapports Google Analytics du site netforce-defense.com pour la page
// « Analytics site » du CRM. Réservé aux utilisateurs connectés au CRM :
// le jeton Firebase envoyé par la page est vérifié auprès de Google.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ev = (names: string[]) => ({
  filter: { fieldName: "eventName", inListFilter: { values: names } },
});

/** Rapport « facultatif » : une dimension personnalisée non déclarée dans GA4 ne doit pas tout casser. */
async function optional(body: Record<string, unknown>): Promise<Row[] | null> {
  try {
    return await runReport(body);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  if (!ga4Configured()) {
    return Response.json({ configured: false });
  }

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 28, 1), 365);
  const cur = { startDate: `${days}daysAgo`, endDate: "today" };
  const prev = { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` };
  const range = { dateRanges: [cur] };

  try {
    const [totals, prevTotals, daily, sources, leadsBySource, pages, countries, devices, events] =
      await Promise.all([
        runReport({ ...range, metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: "engagementRate" }] }),
        runReport({ dateRanges: [prev], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: "engagementRate" }] }),
        runReport({ ...range, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }] }),
        runReport({ ...range, dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 12 }),
        runReport({ ...range, dimensions: [{ name: "sessionSource" }], metrics: [{ name: "eventCount" }], dimensionFilter: ev(["generate_lead"]) }),
        runReport({ ...range, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 10 }),
        runReport({ ...range, dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 12 }),
        runReport({ ...range, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }] }),
        runReport({ ...range, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }, { name: "totalUsers" }], limit: 100 }),
      ]);

    // Détails disponibles une fois les dimensions personnalisées déclarées dans GA4.
    const [abandonByField, formsByName, tiers, ctas, mapCountries, languages, investorSteps] = await Promise.all([
      optional({ ...range, dimensions: [{ name: "customEvent:form" }, { name: "customEvent:last_field" }], metrics: [{ name: "eventCount" }], dimensionFilter: ev(["form_abandon"]), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 20 }),
      optional({ ...range, dimensions: [{ name: "customEvent:form" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: ev(["form_start", "form_error", "form_abandon"]) }),
      optional({ ...range, dimensions: [{ name: "customEvent:tier" }], metrics: [{ name: "eventCount" }], dimensionFilter: ev(["investment_tier_click"]), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] }),
      optional({ ...range, dimensions: [{ name: "customEvent:cta" }], metrics: [{ name: "eventCount" }], dimensionFilter: ev(["cta_click"]), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 10 }),
      optional({ ...range, dimensions: [{ name: "customEvent:country" }], metrics: [{ name: "eventCount" }], dimensionFilter: ev(["map_country_click"]), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 10 }),
      optional({ ...range, dimensions: [{ name: "customEvent:language" }], metrics: [{ name: "eventCount" }], dimensionFilter: ev(["language_change"]) }),
      // Questionnaire investisseur : visiteurs ayant atteint chaque étape (= barre de progression).
      optional({ ...range, dimensions: [{ name: "customEvent:step" }, { name: "customEvent:step_name" }], metrics: [{ name: "totalUsers" }], dimensionFilter: ev(["form_step"]) }),
    ]);

    const t = totals[0]?.mets ?? [0, 0, 0, 0, 0];
    const p = prevTotals[0]?.mets ?? [0, 0, 0, 0, 0];
    const eventCount = (n: string) => events.find((r) => r.dims[0] === n)?.mets[0] ?? 0;
    const leads = new Map(leadsBySource.map((r) => [r.dims[0], r.mets[0]]));

    return Response.json({
      configured: true,
      days,
      kpis: {
        users: t[0], sessions: t[1], pageViews: t[2], avgSession: t[3], engagement: t[4],
        leads: eventCount("generate_lead"),
        prev: { users: p[0], sessions: p[1], pageViews: p[2], avgSession: p[3], engagement: p[4] },
      },
      daily: daily.map((r) => ({ date: r.dims[0], users: r.mets[0], sessions: r.mets[1] })),
      sources: sources.map((r) => ({ source: r.dims[0], medium: r.dims[1], sessions: r.mets[0], users: r.mets[1], leads: leads.get(r.dims[0]) ?? 0 })),
      pages: pages.map((r) => ({ path: r.dims[0], views: r.mets[0], users: r.mets[1] })),
      countries: countries.map((r) => ({ country: r.dims[0], users: r.mets[0] })),
      devices: devices.map((r) => ({ device: r.dims[0], users: r.mets[0] })),
      funnel: {
        start: eventCount("form_start"),
        fields: eventCount("form_field_done"),
        errors: eventCount("form_error"),
        abandon: eventCount("form_abandon"),
        leads: eventCount("generate_lead"),
      },
      actions: {
        cta: eventCount("cta_click"), tiers: eventCount("investment_tier_click"), press: eventCount("press_open"),
        video: eventCount("video_play"), map: eventCount("map_country_click"), investorRead: eventCount("investor_read"),
      },
      details: {
        abandonByField: abandonByField?.map((r) => ({ form: r.dims[0], field: r.dims[1], count: r.mets[0] })) ?? null,
        formsByName: formsByName?.map((r) => ({ form: r.dims[0], event: r.dims[1], count: r.mets[0] })) ?? null,
        tiers: tiers?.map((r) => ({ label: r.dims[0], count: r.mets[0] })) ?? null,
        ctas: ctas?.map((r) => ({ label: r.dims[0], count: r.mets[0] })) ?? null,
        mapCountries: mapCountries?.map((r) => ({ label: r.dims[0], count: r.mets[0] })) ?? null,
        languages: languages?.map((r) => ({ label: r.dims[0], count: r.mets[0] })) ?? null,
        investorSteps:
          investorSteps
            ?.map((r) => ({ step: Number(r.dims[0]) || 0, name: r.dims[1], users: r.mets[0] }))
            .filter((r) => r.step > 0)
            .sort((a, b) => a.step - b.step) ?? null,
      },
    });
  } catch (err) {
    return Response.json({ configured: true, error: (err as Error).message }, { status: 502 });
  }
}
