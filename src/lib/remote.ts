// Kept as a compatibility name for the existing readers.
export const isRemoteLibrary = typeof document !== "undefined" && !!document.querySelector('meta[name="zenty-remote"]');
