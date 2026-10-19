export interface SyncConflict { id: string; at: string; fields: string[] }
export interface SyncState { phase: "loading" | "saved" | "pending" | "syncing" | "offline" | "error"; lastSavedAt: string | null; conflict: SyncConflict | null }
