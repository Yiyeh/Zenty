// Kept as a compatibility name for the existing readers.
export const isRemoteLibrary = typeof document !== "undefined" && !!document.querySelector('meta[name="zenty-remote"]');

let permission = typeof document !== "undefined" ? document.querySelector('meta[name="zenty-permission"]')?.getAttribute("content") : null;
export const isReadOnly = () => isRemoteLibrary && permission === "read";
export function setRemotePermission(value: string) { if (value === "read" || value === "full") permission = value; }
