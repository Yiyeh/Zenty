export interface BackupSummary { id: string; kind: "automatic" | "manual"; createdAt: string; files: number; bytes: number }
export interface BackupStatus { automatic: boolean; keep: number; busy: boolean; error: string; snapshots: BackupSummary[] }
export interface BackupReview { ticket: string; createdAt: string; files: number; bytes: number }
