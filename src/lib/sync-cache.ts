const fallbackKey = "zenty.sync-base-v1";
async function checkpoint(mode: "readonly" | "readwrite", raw?: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") throw new Error("sync.cacheUnavailable");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("zenty-sync-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("checkpoints");
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("sync.cacheUnavailable"));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      try {
        const transaction = database.transaction("checkpoints", mode), store = transaction.objectStore("checkpoints");
        let value: string | null = null;
        const operation = mode === "readonly" ? store.get("base") : store.put(raw, "base");
        operation.onsuccess = () => { if (mode === "readonly" && typeof operation.result === "string") value = operation.result; };
        transaction.oncomplete = () => { database.close(); resolve(value); };
        transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error); };
      } catch (error) { database.close(); reject(error); }
    };
  });
}
export async function readSyncBase(): Promise<string | null> {
  try { return await checkpoint("readonly"); }
  catch { try { return localStorage.getItem(fallbackKey); } catch { return null; } }
}
export async function writeSyncBase(raw: string): Promise<void> {
  try { await checkpoint("readwrite", raw); }
  catch { localStorage.setItem(fallbackKey, raw); }
}
