// Fusion de deux états du siège : rien n'est perdu quand Claude (MCP) et une page écrivent en même temps.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const score = (t: Any) => [(t.versions || []).length, (t.log || []).length, Math.max(0, ...(t.log || []).map((l: Any) => l.at || 0))];
const newer = (a: Any, b: Any) => {
  const x = score(a), y = score(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b;
  return b;
};
export interface Deleted { tasks?: Set<string>; projects?: Set<string> }
export function mergeState(base: Any, inc: Any, del: Deleted = {}): Any {
  const out = { ...base, ...inc };
  const byId = (xs: Any[], ys: Any[], pick: (a: Any, b: Any) => Any, gone?: Set<string>) => {
    const m = new Map(xs.map((x) => [x.id, x]));
    ys.forEach((y) => m.set(y.id, m.has(y.id) ? pick(m.get(y.id), y) : y));
    gone?.forEach((id) => m.delete(id));
    return [...m.values()];
  };
  out.tasks = byId(base.tasks || [], inc.tasks || [], newer, del.tasks);
  out.projects = byId(base.projects || [], inc.projects || [], (a, b) => ({
    ...a, ...b,
    decisions: (b.decisions || []).map((d: Any, i: number) => ({ ...d, ok: d.ok || !!(a.decisions?.[i]?.ok && a.decisions[i].t === d.t) })),
  }), del.projects);
  const L = new Map<string, Any>();
  [...(base.links || []), ...(inc.links || [])].forEach((l) => L.set(`${l.a}|${l.b}|${l.at}`, l));
  out.links = [...L.values()].sort((a, b) => a.at - b.at).slice(-300);
  out.kbEdits = { ...(base.kbEdits || {}), ...(inc.kbEdits || {}) };
  out.kbBase = { ...(base.kbBase || {}), ...(inc.kbBase || {}) };
  return out;
}
