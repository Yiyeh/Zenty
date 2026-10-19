import { tr } from "./i18n";
import { libraryRequest } from "./library-client";
import { MAX_DOCUMENT_BYTES } from "./library";
export async function saveChapterOffline(pages: string[], title: string, signal: AbortSignal, progress: (done: number) => void) {
  const { default: JSZip } = await import("jszip"); const archive = new JSZip(); let bytes = 0;
  if (!pages.length || pages.length > 1000) throw new Error(tr("reader.offlineTooLarge"));
  for (let index = 0; index < pages.length; index++) {
    signal.throwIfAborted();
    const url = new URL(pages[index], location.origin);
    if (url.origin !== location.origin || url.pathname !== "/api/mangadex/image") throw new Error(tr("reader.offlineHint"));
    const response = await fetch(url, { signal });
    if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) throw new Error(tr("MangaReader.86cb7c5de6"));
    const reader = response.body!.getReader(); const chunks: Uint8Array[] = [];
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > MAX_DOCUMENT_BYTES - 2_000_000) throw new Error(tr("reader.offlineTooLarge")); chunks.push(value); } } finally { await reader.cancel().catch(() => {}); }
    const extension = response.headers.get("Content-Type")!.includes("png") ? "png" : response.headers.get("Content-Type")!.includes("webp") ? "webp" : "jpg";
    archive.file(`${String(index + 1).padStart(4, "0")}.${extension}`, new Blob(chunks as BlobPart[])); progress(index + 1);
  }
  signal.throwIfAborted(); const blob = await archive.generateAsync({ type: "blob", compression: "STORE" }); signal.throwIfAborted();
  if (blob.size > MAX_DOCUMENT_BYTES) throw new Error(tr("reader.offlineTooLarge"));
  return libraryRequest(`?name=${encodeURIComponent(title.replace(/[<>:"/\\|?*\p{Cc}]/gu, "_").slice(0, 170) + ".cbz")}`, { method: "POST", body: blob, signal });
}
