// Mise en forme compacte d'un document du tracker pour les prompts IA.

export interface TrackerDoc {
  userId?: string;
  date?: string;
  sessions?: Record<string, number>;
  urls?: Record<string, number>;
  documents?: { name: string; app: string; duration: number }[];
  idle?: number;
  active?: number;
  outlook?: { emailsSent?: number; emailsReceived?: number; meetings?: { title: string; start: string; duration: number }[] };
  canva?: { designs?: { name: string; isNew?: boolean; editedAt?: string; pageCount?: number }[] };
}

const min = (s: number) => Math.round(s / 60);

function top<T>(entries: [string, number][], n: number, fmt: (k: string, v: number) => T): T[] {
  return entries.sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => fmt(k, v));
}

export function activityText(d: TrackerDoc): string {
  const lines: string[] = [];
  lines.push(`Temps actif : ${min(d.active ?? 0)} min, inactif : ${min(d.idle ?? 0)} min.`);
  const apps = top(Object.entries(d.sessions ?? {}).filter(([, v]) => v >= 60), 10, (k, v) => `${k} (${min(v)} min)`);
  if (apps.length) lines.push(`Applications : ${apps.join(", ")}.`);
  const sites = top(Object.entries(d.urls ?? {}).filter(([, v]) => v >= 60), 10, (k, v) => `${k} (${min(v)} min)`);
  if (sites.length) lines.push(`Sites web : ${sites.join(", ")}.`);
  const docs = [...(d.documents ?? [])]
    .filter((x) => x.duration >= 60 && x.name !== "missing value")
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 15)
    .map((x) => `« ${x.name} » dans ${x.app} (${min(x.duration)} min)`);
  if (docs.length) lines.push(`Fenêtres / documents : ${docs.join(" ; ")}.`);
  const designs = d.canva?.designs ?? [];
  if (designs.length) {
    lines.push(
      `Canva : ${designs.map((x) => `« ${x.name} » (${x.isNew ? "créé" : "modifié"}${x.pageCount ? `, ${x.pageCount} pages` : ""})`).join(", ")}.`,
    );
  }
  if (d.outlook) {
    const m = d.outlook.meetings ?? [];
    lines.push(
      `Outlook : ${d.outlook.emailsSent ?? 0} emails envoyés, ${d.outlook.emailsReceived ?? 0} reçus` +
        (m.length ? `, réunions : ${m.map((x) => `${x.title} à ${x.start} (${x.duration} min)`).join(", ")}` : "") +
        ".",
    );
  }
  return lines.join("\n");
}

export const SUMMARY_SYSTEM = `Tu rédiges le résumé de journée d'un membre de l'équipe Netforce (start-up française de gants tactiques pour forces de l'ordre et défense), à partir des données de son tracker d'activité.
Règles :
- En français, 3 à 5 phrases, ton factuel et neutre, sans jugement sur la productivité.
- Dis concrètement sur quoi la personne a travaillé (projets, documents, designs, outils, échanges), avec les durées principales.
- Regroupe intelligemment (ex. plusieurs fenêtres d'un même document). N'invente rien qui n'est pas dans les données.
- Ignore le bruit (Finder, onglets vides, fenêtres de moins d'une minute).
- Pas de titre, pas de liste à puces.`;
