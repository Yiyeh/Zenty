import type { DashboardData } from "./dashboard.ts";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** Apply only the edits made since base. Independent edits survive; deletion wins over stale edits. */
function merge(base: unknown, local: unknown, remote: unknown, trail: string[] = [], conflicts?: string[]): unknown {
  if (same(base, local)) return remote;
  if (same(base, remote) || same(local, remote)) return local;
  if (base !== undefined && (local === undefined || remote === undefined)) { if (conflicts && conflicts.length < 100) conflicts.push(trail.join(".")); return undefined; }
  if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)) {
    const items = [...base, ...local, ...remote];
    const key = items.length && items.every((item) => object(item) && typeof item.id === "string") ? "id"
      : items.length && items.every((item) => object(item) && typeof item.date === "string") ? "date" : null;
    if (key) {
      const index = (array: Record<string, unknown>[]) => new Map(array.map((item) => [item[key], item]));
      const b = index(base), l = index(local), r = index(remote);
      return [...new Set([...r.keys(), ...l.keys()])].flatMap((id) => {
        const item = merge(b.get(id), l.get(id), r.get(id), [...trail, String(id)], conflicts); return item === undefined ? [] : [item];
      });
    }
  }
  if (object(local) && object(remote) && (base === undefined || object(base))) {
    const old = object(base) ? base : {};
    return Object.fromEntries([...new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(old)])]
      .filter((key) => !["__proto__", "constructor", "prototype"].includes(key))
      .flatMap((key) => { const value = merge(old[key], local[key], remote[key], [...trail, key], conflicts); return value === undefined ? [] : [[key, value]]; }));
  }
  if (conflicts && conflicts.length < 100) conflicts.push(trail.join("."));
  return local;
}
export function mergeDashboardWithConflicts(base: DashboardData, local: DashboardData, remote: DashboardData) {
  const conflicts: string[] = [];
  const data = merge(base, local, remote, [], conflicts) as DashboardData;
  return { data, conflicts: [...new Set(conflicts)] };
}
export function mergeDashboard(base: DashboardData, local: DashboardData, remote: DashboardData): DashboardData {
  return merge(base, local, remote) as DashboardData;
}
