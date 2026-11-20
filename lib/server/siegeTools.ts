// Outils MCP du « Siège IA » : Claude pilote les agents (projets, tâches, livrables) depuis le connecteur du CRM.
// Données Firestore : siege/state (projets, échanges, cerveau) + siegeTasks/{id}.
/* eslint-disable @typescript-eslint/no-explicit-any */
import data from "@/lib/siege/data.json";
import { store } from "./store";
import type { ToolDef } from "./mcpTools";

type Any = any;
const D = data as Any;
const A: Any[] = D.A;
const AG: Record<string, Any> = Object.fromEntries(A.map((a) => [a.id, a]));
const QN: Record<string, string> = Object.fromEntries(D.Q.map((q: Any) => [q.id, q.n]));
const COMM: Any[] = D.COMM;
const CM: Record<string, Any> = Object.fromEntries(COMM.map((c) => [c.id, c]));
const KB: Any[] = D.KB;
const KBI: Record<string, Any> = Object.fromEntries(KB.map((f) => [f.id, f]));
const ST: Record<string, string> = D.ST;
const KBC = ["identite", "doctrine", "produit"];
const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => Date.now();
const kbIds = (a: Any) => [...new Set([...KBC, ...(D.KBMAP[a.id] || [])])] as string[];
const kids = (id: string) => A.filter((a) => a.parent === id);
const commsOf = (id: string) => COMM.filter((c) => c.m.some((x: Any) => x[0] === id));

class SiegeError extends Error { name = "SiegeError"; }

/* ---------- état ---------- */
async function load() {
  const s = await store();
  const st = ((await s.get("siege", "state")) as Any) || {};
  const tasks = ((await s.list("siegeTasks")) as Any[]).sort((a, b) => (a._o ?? 0) - (b._o ?? 0));
  const S: Any = { me: "mkt", projects: [], links: [], kbEdits: {}, kbBase: {}, ...st, tasks };
  delete S.updatedAt; delete S.updatedBy;
  S.projects.forEach((p: Any) => { p.decisions ||= []; p.tour ||= []; p.risques ||= []; });
  S.tasks.forEach(normTask);
  return S;
}
function normTask(t: Any) {
  t.besoins ||= []; t.gerard ||= []; t.dep ||= []; t.log ||= []; t.livrable ||= ""; t.versions ||= [];
  t.owner ||= "agent"; t.plan ??= null; t.prio = ["haute", "moyenne", "basse"].includes(t.prio) ? t.prio : "moyenne"; t.statut = ST[t.statut] ? t.statut : "a_faire";
  return t;
}
/** Modifie l'état : fn reçoit l'état et renvoie les ids de tâches modifiées (true = état général modifié aussi). */
async function mutate(fn: (S: Any) => { tasks?: string[]; state?: boolean }) {
  const S = await load();
  const ch = fn(S);
  const s = await store();
  if (ch.state) {
    const { tasks, ...rest } = S;
    void tasks;
    await s.set("siege", "state", JSON.parse(JSON.stringify({ ...rest, updatedAt: now(), updatedBy: "claude" })));
  }
  for (const id of ch.tasks || []) {
    const t = S.tasks.find((x: Any) => x.id === id);
    if (t) await s.set("siegeTasks", id, JSON.parse(JSON.stringify({ ...t, _o: t._o ?? now() })));
  }
}
function chatLog(d: Any): Any[] { try { const l = d && d.log ? JSON.parse(String(d.log)) : []; return Array.isArray(l) ? l : []; } catch { return []; } }
const TK = (S: Any, id: string) => { const t = S.tasks.find((x: Any) => x.id === id); if (!t) throw new SiegeError("Tâche inconnue : " + id); return t; };
const PJ = (S: Any, id: string) => { const p = S.projects.find((x: Any) => x.id === id); if (!p) throw new SiegeError("Projet inconnu : " + id); return p; };
const AGT = (id: string) => { const a = AG[id]; if (!a) throw new SiegeError("Agent inconnu : " + id + ". Ids : " + A.map((x) => x.id).join(", ")); return a; };
const log = (t: Any, who: string, txt: string, kind = "evt") => t.log.push({ at: now(), who, txt, kind });
const kbTxt = (S: Any, id: string) => S.kbEdits?.[id] || S.kbBase?.[id] || "";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + " […]" : s);

function persona(S: Any, a: Any) {
  const boss = a.parent ? AG[a.parent] : null, team = kids(a.id), cs = commsOf(a.id);
  const block = kbIds(a).map((id) => `### ${KBI[id].t} (source : ${KBI[id].src})\n${kbTxt(S, id) || "(fiche non importée)"}`).join("\n\n");
  const mem = S.tasks.filter((t: Any) => t.statut === "fait" && t.livrable && t.agent !== a.id).slice(-8)
    .map((t: Any) => `- « ${t.titre} » par ${AG[t.agent]?.name ?? "?"} [${t.id}]`).join("\n") || "aucun pour l'instant";
  return `${D.CTX}
Tu es ${a.name}, ${a.role} au siège virtuel de Netforce (${QN[a.q]}).
Mission : ${a.mission}
${a.w ? "Rôle dans l'introduction en bourse : " + a.w + "\n" : ""}${boss ? `Tu rends compte à ${boss.name} (${boss.role}).\n` : ""}${team.length ? "Ton équipe : " + team.map((m) => `${m.name} (${m.role})`).join(", ") + ".\n" : ""}${cs.length ? "Tes comités : " + cs.map((c) => c.n).join(", ") + ".\n" : ""}
CERVEAU NETFORCE — fiches de ton poste :
${block}

${D.METH[a.id] ? "Ta méthode (à appliquer seulement si elle sert la tâche) : " + D.METH[a.id].m + "\n" : ""}Travail validé récemment par tes collègues :
${mem}

Règles : tu prépares, Gérard décide ; rien n'est envoyé, signé, publié ni payé. Aucun chiffre inventé : cerveau, puis données du CRM et Drive, puis [À COMPLÉTER : …]. Français, phrases courtes, livrables courts et utilisables.`;
}

export const SIEGE_GUIDE = `SIÈGE IA : ${A.length} agents IA (un par poste de direction et d'équipe : DAF, CMO, juridique, relations investisseurs, SEO…) au service de Netforce, qui prépare son introduction en bourse. Les outils siege_* permettent de les faire travailler : tenir une réunion (siege_projet_creer), jouer un agent (siege_agent_fiche puis siege_livrable_enregistrer), noter un échange entre agents, traiter ce que Gérard a confié à son Claude depuis le CRM — tâches à rédiger et questions aux agents — quand il dit « réponds au siège » (siege_questions_attente). L'équipe valide dans le CRM, page « Siège IA ». Commence par siege_guide.`;

const GUIDE = `${SIEGE_GUIDE}

COMMENT FAIRE
1. Nouveau sujet → réunion : lis siege_etat et siege_organigramme, choisis 2 à 6 agents utiles (ou les membres du comité demandé), donne l'avis court de chacun, puis siege_projet_creer avec une tâche concrète par agent.
2. Faire travailler un agent : siege_agent_fiche (mission, fiches du cerveau, méthode, travail des collègues) et siege_tache_lire, puis joue ce rôle. Cherche les faits dans le cerveau, siege_memoire_chercher, les outils du CRM (contacts, pipeline, data room…) et tes autres connecteurs (Drive, Canva) et skills. Enregistre avec siege_livrable_enregistrer : la tâche passe « À valider ».
2 bis. « Réponds au siège » : siege_questions_attente liste ce que Gérard a confié à son Claude depuis le CRM. D'abord les tâches à rédiger (taches_a_rediger : siege_agent_fiche, siege_tache_lire, puis siege_livrable_enregistrer), ensuite les questions posées aux agents dans le chat (réponds dans le rôle de chaque agent puis siege_question_repondre).
3. Avis d'un autre poste : lis la fiche du collègue, réponds en son nom, note-le avec siege_echange_noter.
4. Gérard valide plans, livrables et décisions dans le CRM. Ne passe une tâche à « fait » ou une décision à tranchée que s'il le demande.
Règles de marque : jamais « taser », « pistolet électrique », « électrocuter », ni « arme » seul ; aucun concurrent cité ; pas d'emoji. Si siege_cerveau_lire indique des fiches non importées, propose à Gérard de les importer (siege_cerveau_importer).`;

const S_ = (t: string, d?: string) => ({ type: "string", ...(d ? { description: d } : {}) });
const ARR = (items: Any, d?: string) => ({ type: "array", items, ...(d ? { description: d } : {}) });
const OBJ = (properties: Any, required: string[] = []) => ({ type: "object", properties, required });
const AGENT = S_("string", "Id d'agent (ex. daf, cmo, redac, jur, ir, chef) — voir siege_organigramme");
const TACHE = OBJ({
  agent: AGENT, titre: S_("string", "3 à 7 mots, commence par un verbe"), detail: S_("string"),
  besoins: ARR(S_("string"), "Seulement ce qui est introuvable (cerveau, CRM, Drive)"),
  actions_gerard: ARR(S_("string"), "Ce que Gérard doit faire lui-même"),
  priorite: { type: "string", enum: ["haute", "moyenne", "basse"] },
  depend_de: ARR({ type: "integer" }, "Index (dès 0) des tâches de cette liste à terminer avant"),
}, ["agent", "titre"]);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);
function newTask(pid: string | null, t: Any, id = "t-" + uid()) {
  AGT(t.agent);
  const x = normTask({ id, pid, agent: t.agent, titre: str(t.titre) || "Tâche", detail: str(t.detail), besoins: arr(t.besoins).map((b) => ({ t: b, ok: false })), gerard: arr(t.actions_gerard).map((g) => ({ t: g, ok: false })), prio: t.priorite, statut: "a_faire", _o: now() });
  log(x, "chef", "Tâche confiée (Claude)");
  return x;
}

export const SIEGE_TOOLS: ToolDef[] = [
  { name: "siege_guide", description: "Siège IA : mode d'emploi (réunions, agents, livrables, règles). À lire en premier.", inputSchema: OBJ({}), annotations: { readOnlyHint: true }, run: async () => GUIDE },
  { name: "siege_etat", description: "Siège IA : projets et tâches par statut, et ce qui attend Gérard (livrables et plans à valider, besoins, décisions).", inputSchema: OBJ({}), annotations: { readOnlyHint: true },
    run: async () => { const S = await load();
      const att: Any[] = [];
      S.tasks.forEach((t: Any) => { const who = AG[t.agent]?.name;
        if (t.statut === "valider" && t.livrable) att.push({ type: "livrable à valider", task_id: t.id, titre: t.titre, agent: who });
        if (t.plan?.statut === "propose") att.push({ type: "plan à valider", task_id: t.id, titre: t.titre, agent: who });
        t.besoins.filter((b: Any) => !b.ok).forEach((b: Any) => att.push({ type: "besoin", task_id: t.id, agent: who, detail: b.t })); });
      S.projects.forEach((p: Any) => p.decisions.forEach((d: Any, i: number) => { if (!d.ok) att.push({ type: "décision", projet_id: p.id, index: i, detail: d.t }); }));
      return { projets: S.projects.map((p: Any) => ({ id: p.id, titre: p.titre, taches: S.tasks.filter((t: Any) => t.pid === p.id).map((t: Any) => ({ id: t.id, agent: t.agent, titre: t.titre, statut: ST[t.statut] })) })),
        taches_hors_projet: S.tasks.filter((t: Any) => !t.pid).map((t: Any) => ({ id: t.id, agent: t.agent, titre: t.titre, statut: ST[t.statut] })),
        attend_gerard: att, cerveau_importe: KB.filter((f) => kbTxt(S, f.id)).length + "/" + KB.length }; } },
  { name: "siege_organigramme", description: "Siège IA : agents (id, nom, poste, direction, rend compte à, rôle IPO) et comités avec leurs membres.", inputSchema: OBJ({}), annotations: { readOnlyHint: true },
    run: async () => ({ agents: A.map((a) => ({ id: a.id, nom: a.name, poste: a.role, direction: QN[a.q], rend_compte_a: a.parent || null, role_ipo: a.w || "" })), comites: COMM.map((c) => ({ id: c.id, nom: c.n, membres: c.m.map((x: Any) => ({ agent: x[0], role: x[1] || "membre" })) })) }) },
  { name: "siege_agent_fiche", description: "Siège IA : fiche complète d'un agent pour jouer son rôle (mission, fiches du cerveau Netforce, méthode, équipe, travail des collègues, ses tâches).", inputSchema: OBJ({ agent_id: AGENT }, ["agent_id"]), annotations: { readOnlyHint: true },
    run: async (a) => { const ag = AGT(str(a.agent_id)); const S = await load();
      return persona(S, ag) + "\n\nTÂCHES :\n" + (S.tasks.filter((t: Any) => t.agent === ag.id).map((t: Any) => `- [${t.id}] ${t.titre} — ${ST[t.statut]}`).join("\n") || "aucune"); } },
  { name: "siege_cerveau_lire", description: "Siège IA : sans argument, liste des fiches du cerveau Netforce ; avec « fiche », son contenu.", inputSchema: OBJ({ fiche: S_("string", "Id : " + KB.map((f) => f.id).join(", ")) }), annotations: { readOnlyHint: true },
    run: async (a) => { const S = await load(); const id = str(a.fiche);
      if (!id) return KB.map((f) => ({ id: f.id, titre: f.t, source: f.src, importee: !!kbTxt(S, f.id) }));
      if (!KBI[id]) throw new SiegeError("Fiche inconnue."); return `# ${KBI[id].t}\nSource : ${KBI[id].src}\n\n${kbTxt(S, id) || "(fiche non importée)"}`; } },
  { name: "siege_cerveau_importer", description: "Siège IA : importe ou remplace le texte de base de fiches du cerveau (faits Netforce issus du Drive). Uniquement à la demande de Gérard. Contenu confidentiel stocké dans la base du CRM.", inputSchema: OBJ({ fiches: ARR(OBJ({ id: S_("string"), texte: S_("string") }, ["id", "texte"])) }, ["fiches"]), annotations: { destructiveHint: true },
    run: async (a) => { const fs = (Array.isArray(a.fiches) ? a.fiches : []) as Any[]; const bad = fs.filter((f) => !KBI[f.id]); if (bad.length) throw new SiegeError("Fiches inconnues : " + bad.map((f) => f.id).join(", "));
      await mutate((S) => { fs.forEach((f) => { S.kbBase[f.id] = str(f.texte); }); return { state: true }; }); return { importees: fs.length }; } },
  { name: "siege_cerveau_corriger", description: "Siège IA : corrige une fiche du cerveau (prime sur le texte de base). Seulement à la demande de Gérard.", inputSchema: OBJ({ fiche: S_("string"), texte: S_("string") }, ["fiche", "texte"]),
    run: async (a) => { const id = str(a.fiche); if (!KBI[id]) throw new SiegeError("Fiche inconnue."); await mutate((S) => { S.kbEdits[id] = str(a.texte); return { state: true }; }); return { ok: true }; } },
  { name: "siege_memoire_chercher", description: "Siège IA : cherche par mots-clés dans les livrables des agents, les projets, les décisions et le cerveau.", inputSchema: OBJ({ mots_cles: S_("string") }, ["mots_cles"]), annotations: { readOnlyHint: true },
    run: async (a) => { const S = await load(); const w = str(a.mots_cles).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((x) => x.length > 2);
      const items = [...S.tasks.filter((t: Any) => t.livrable).map((t: Any) => ({ type: "livrable", id: t.id, titre: t.titre, agent: t.agent, statut: ST[t.statut], texte: t.livrable })),
        ...S.projects.map((p: Any) => ({ type: "projet", id: p.id, titre: p.titre, texte: p.synthese })), ...KB.map((f) => ({ type: "fiche", id: f.id, titre: f.t, texte: kbTxt(S, f.id) }))];
      return items.map((it) => { const s = (it.titre + " " + it.texte).toLowerCase(); return { it, n: w.reduce((n, x) => n + (s.split(x).length - 1), 0) }; })
        .filter((r) => r.n).sort((x, y) => y.n - x.n).slice(0, 5).map((r) => ({ ...r.it, texte: clip(String(r.it.texte || ""), 1800) })); } },
  { name: "siege_projet_creer", description: "Siège IA : enregistre une réunion — titre, brief, synthèse, avis des agents, décisions à trancher, risques, tâches confiées.", inputSchema: OBJ({ titre: S_("string"), brief: S_("string"), synthese: S_("string"), comite: S_("string", "Id du comité réuni : " + COMM.map((c) => c.id).join(", ")), tour: ARR(OBJ({ agent: AGENT, avis: S_("string") }, ["agent", "avis"])), decisions: ARR(S_("string")), risques: ARR(S_("string")), taches: ARR(TACHE) }, ["titre", "brief", "synthese", "taches"]),
    run: async (a) => { const ts = (Array.isArray(a.taches) ? a.taches : []) as Any[]; if (!ts.length) throw new SiegeError("Au moins une tâche.");
      if (a.comite && !CM[str(a.comite)]) throw new SiegeError("Comité inconnu.");
      const pid = "p-" + uid(), ids = ts.map(() => "t-" + uid());
      const made = ts.map((t, i) => { const x = newTask(pid, t, ids[i]); x.dep = arr(t.depend_de?.map(String)).map((k) => ids[Number(k)]).filter(Boolean); return x; });
      ((a.tour as Any[]) || []).forEach((r) => AGT(r.agent));
      await mutate((S) => { S.projects.push({ id: pid, titre: str(a.titre), brief: str(a.brief), synthese: str(a.synthese), tour: a.tour || [], decisions: arr(a.decisions).map((t) => ({ t, ok: false })), risques: arr(a.risques), date: now(), source: "claude", comm: str(a.comite) || null }); S.tasks.push(...made); return { state: true, tasks: ids }; });
      return { projet_id: pid, taches: made.map((t) => ({ id: t.id, agent: t.agent, titre: t.titre })) }; } },
  { name: "siege_projet_lire", description: "Siège IA : détail d'un projet (brief, synthèse, tour de table, décisions avec index, risques, tâches).", inputSchema: OBJ({ projet_id: S_("string") }, ["projet_id"]), annotations: { readOnlyHint: true },
    run: async (a) => { const S = await load(); const p = PJ(S, str(a.projet_id));
      return { ...p, decisions: p.decisions.map((d: Any, i: number) => ({ index: i, ...d })), taches: S.tasks.filter((t: Any) => t.pid === p.id).map((t: Any) => ({ id: t.id, agent: t.agent, titre: t.titre, statut: ST[t.statut], extrait: t.livrable ? clip(t.livrable, 400) : null })) }; } },
  { name: "siege_tache_lire", description: "Siège IA : détail d'une tâche (consigne, besoins, plan, commentaires et corrections demandées, livrable, livrables des tâches préalables).", inputSchema: OBJ({ task_id: S_("string") }, ["task_id"]), annotations: { readOnlyHint: true },
    run: async (a) => { const S = await load(); const t = TK(S, str(a.task_id)); const { versions, ...rest } = t;
      return { ...rest, statut: ST[t.statut], nb_versions: versions.length, projet: t.pid ? S.projects.find((p: Any) => p.id === t.pid) ?? null : null, prealables: t.dep.map((d: string) => S.tasks.find((x: Any) => x.id === d)).filter(Boolean).map((d: Any) => ({ id: d.id, titre: d.titre, agent: d.agent, statut: ST[d.statut], livrable: d.livrable ? clip(d.livrable, 2500) : null })) }; } },
  { name: "siege_tache_creer", description: "Siège IA : confie une nouvelle tâche à un agent (dans un projet ou hors projet).", inputSchema: OBJ({ projet_id: S_("string"), tache: TACHE }, ["tache"]),
    run: async (a) => { const S0 = await load(); const pid = str(a.projet_id) || null; if (pid) PJ(S0, pid); const x = newTask(pid, a.tache);
      await mutate((S) => { S.tasks.push(x); return { tasks: [x.id] }; }); return { task_id: x.id }; } },
  { name: "siege_tache_plan", description: "Siège IA : l'agent propose son plan (2-3 étapes) ; Gérard le valide dans le CRM.", inputSchema: OBJ({ task_id: S_("string"), etapes: ARR(S_("string")), question: OBJ({ texte: S_("string"), options: ARR(S_("string")) }, ["texte", "options"]) }, ["task_id", "etapes"]),
    run: async (a) => { const id = str(a.task_id); await mutate((S) => { const t = TK(S, id); const et = arr(a.etapes); t.plan = { etapes: et, statut: "propose", question: a.question || null, reponse: "" }; log(t, t.agent, `A proposé un plan en ${et.length} étapes`); return { tasks: [id] }; }); return { ok: true }; } },
  { name: "siege_livrable_enregistrer", description: "Siège IA : enregistre le livrable rédigé par l'agent (markdown) ; la tâche passe « À valider ».", inputSchema: OBJ({ task_id: S_("string"), contenu: S_("string"), sources: ARR(S_("string"), "Documents ou outils consultés") }, ["task_id", "contenu"]),
    run: async (a) => { const id = str(a.task_id), c = str(a.contenu); if (c.length < 20) throw new SiegeError("Livrable trop court.");
      await mutate((S) => { const t = TK(S, id); arr(a.sources).forEach((s) => log(t, t.agent, "A consulté " + s)); t.versions.push({ at: now(), by: t.agent, txt: c.slice(0, 20000) }); t.livrable = c.slice(0, 20000); t.statut = "valider"; delete t.claude; t.feedback = ""; if (t.plan) t.plan.statut = "fait"; log(t, t.agent, `A livré la version ${t.versions.length}, à valider (via Claude)`); return { tasks: [id] }; });
      return { ok: true, statut: "À valider" }; } },
  { name: "siege_tache_statut", description: "Siège IA : change le statut d'une tâche (a_faire, en_cours, valider, fait). « fait » seulement si Gérard le demande.", inputSchema: OBJ({ task_id: S_("string"), statut: { type: "string", enum: ["a_faire", "en_cours", "valider", "fait"] }, note: S_("string") }, ["task_id", "statut"]),
    run: async (a) => { const id = str(a.task_id), st = str(a.statut); if (!ST[st]) throw new SiegeError("Statut invalide."); await mutate((S) => { const t = TK(S, id); t.statut = st; log(t, "chef", "Statut : " + ST[st] + (a.note ? " — " + str(a.note) : "")); return { tasks: [id] }; }); return { ok: true }; } },
  { name: "siege_tache_commenter", description: "Siège IA : ajoute un commentaire au fil d'une tâche (auteur : id d'agent, ou « moi » pour Gérard).", inputSchema: OBJ({ task_id: S_("string"), auteur: S_("string"), texte: S_("string") }, ["task_id", "auteur", "texte"]),
    run: async (a) => { const id = str(a.task_id); await mutate((S) => { const t = TK(S, id); log(t, AG[str(a.auteur)] ? str(a.auteur) : "moi", str(a.texte), "com"); return { tasks: [id] }; }); return { ok: true }; } },
  { name: "siege_echange_noter", description: "Siège IA : note la question d'un agent à un collègue et la réponse (visible dans la toile et la tâche).", inputSchema: OBJ({ de: AGENT, a: AGENT, question: S_("string"), reponse: S_("string"), task_id: S_("string") }, ["de", "a", "question", "reponse"]),
    run: async (x) => { const de = AGT(str(x.de)), vers = AGT(str(x.a)); const tid = str(x.task_id);
      await mutate((S) => { S.links.push({ a: de.id, b: vers.id, q: clip(str(x.question), 140), r: clip(str(x.reponse), 1500), at: now() }); S.links = S.links.slice(-300);
        const t = tid ? S.tasks.find((y: Any) => y.id === tid) : null; if (t) log(t, de.id, `Question à ${vers.name} : ${clip(str(x.question), 140)} — Réponse : ${clip(str(x.reponse), 400)}`, "com");
        return { state: true, tasks: t ? [t.id] : [] }; });
      return { ok: true }; } },
  { name: "siege_decision_trancher", description: "Siège IA : marque une décision de projet comme tranchée, avec la note de Gérard. Seulement s'il a décidé.", inputSchema: OBJ({ projet_id: S_("string"), index: { type: "integer" }, note: S_("string") }, ["projet_id", "index"]),
    run: async (a) => { await mutate((S) => { const p = PJ(S, str(a.projet_id)); const d = p.decisions[Number(a.index)]; if (!d) throw new SiegeError("Décision introuvable."); d.ok = true; if (a.note) d.note = str(a.note); return { state: true }; }); return { ok: true }; } },
  { name: "siege_questions_attente", description: "Siège IA : tout ce qui attend ton Claude (à appeler quand Gérard dit « réponds au siège ») : les tâches que Gérard t'a confiées à rédiger, et les questions posées aux agents dans le CRM (mode « Ton Claude »).", inputSchema: OBJ({ agent: S_("string", "Filtrer sur un agent (facultatif)") }),
    run: async (a) => { const s = await store(); const only = str(a.agent); const out: Any[] = [];
      for (const d of await s.list("siegeChats")) { const ag = AG[String(d.id)]; if (!ag || (only && ag.id !== only)) continue; const lg = chatLog(d);
        lg.forEach((m: Any, i: number) => { if (m.st !== "attente") return; out.push({ agent: ag.id, nom: ag.name, poste: ag.role, question_id: m.m, question: m.c, posee_le: m.at ? new Date(m.at).toISOString() : null, discussion_recente: lg.slice(Math.max(0, i - 8), i).filter((x: Any) => x.r !== "t").map((x: Any) => (x.r === "u" ? "Gérard : " : ag.name + " : ") + clip(String(x.c), 600)) }); }); }
      out.sort((x, y) => String(x.posee_le).localeCompare(String(y.posee_le)));
      const S = await load();
      const taches = S.tasks.filter((t: Any) => t.claude && t.statut !== "valider" && t.statut !== "fait" && (!only || t.agent === only)).map((t: Any) => ({
        task_id: t.id, agent: t.agent, nom: AG[t.agent]?.name ?? t.agent, titre: t.titre, detail: t.detail || "", confiee_le: new Date(t.claude.at || now()).toISOString(),
        plan_valide: t.plan?.etapes || null, reponse_de_gerard: t.plan?.reponse || null, correction_demandee: t.feedback || null,
        informations_fournies: t.besoins.filter((b: Any) => b.ok && b.val).map((b: Any) => `${b.t} : ${clip(String(b.val), 400)}`),
      }));
      const consigneTaches = "Pour chaque tâche : lis siege_agent_fiche de l'agent puis siege_tache_lire, rédige le livrable dans son rôle (en suivant le plan validé et la correction demandée s'il y en a une ; appuie-toi sur le cerveau, le CRM, le Drive, Canva et tes skills ; [À COMPLÉTER : …] pour ce qui manque, aucun chiffre inventé), puis enregistre-le avec siege_livrable_enregistrer : il s'affiche dans le CRM, à valider par Gérard.";
      return { nb_taches: taches.length, taches_a_rediger: taches, consigne_taches: taches.length ? consigneTaches : "Aucune tâche confiée.", nb: out.length, questions: out, consigne: out.length ? "Pour chaque question : lis siege_agent_fiche de l'agent, réponds dans son rôle (à la première personne, court, factuel, sans inventer) en t'appuyant sur le cerveau, le CRM, le Drive, Canva et tes skills, puis envoie la réponse avec siege_question_repondre. Si la question demande un travail, tu peux aussi créer la tâche (siege_tache_creer) et enregistrer le livrable. Rien n'est envoyé, publié, signé ni payé : Gérard décide." : "Aucune question en attente." }; } },
  { name: "siege_question_repondre", description: "Siège IA : envoie ta réponse (au nom de l'agent) à une question posée dans le chat du CRM. Elle s'affiche dans la discussion de l'agent.", inputSchema: OBJ({ agent: AGENT, question_id: S_("string"), reponse: S_("string", "Réponse en markdown simple, écrite par l'agent à la première personne") }, ["agent", "question_id", "reponse"]),
    run: async (a) => { const ag = AGT(str(a.agent)); const qid = str(a.question_id), rep = str(a.reponse); if (rep.length < 2) throw new SiegeError("Réponse vide.");
      const s = await store(); const d = await s.get("siegeChats", ag.id); const lg = chatLog(d); const i = lg.findIndex((m: Any) => m.m === qid);
      if (i < 0) throw new SiegeError("Question introuvable dans le chat de " + ag.name + ".");
      if (lg[i].st !== "attente") return { ok: true, deja: "Cette question a déjà une réponse." };
      lg[i].st = "repondu"; let j = i + 1; while (j < lg.length && lg[j].r !== "u") j++;
      lg.splice(j, 0, { m: "m-" + uid(), r: "a", c: rep.slice(0, 12000), via: "claude", re: qid, at: now() });
      await s.set("siegeChats", ag.id, { log: JSON.stringify(lg), attente: lg.filter((m: Any) => m.st === "attente").length, at: now() });
      return { ok: true, affiche_dans: "CRM › Siège IA › " + ag.name + " › Discuter" }; } },
];

export const isSiegeError = (e: unknown) => e instanceof SiegeError;
