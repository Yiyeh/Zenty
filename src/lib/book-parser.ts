import DOMPurify from "dompurify";
import JSZip from "jszip";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { LibraryDocument } from "./library";
import { archivePath, naturalPageSort } from "./library";
export interface BookChapter {
  title: string;
  path: string;
}
export interface ReaderBook {
  kind: "pdf" | "reflow" | "images";
  total: number;
  chapters: BookChapter[];
  chapter?: (index: number) => Promise<string>;
  image?: (index: number) => Promise<string>;
  pdf?: PDFDocumentProxy;
  cleanup: () => void;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function xml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error(
      "El documento contiene una estructura XML que no se pudo leer.",
    );
  return doc;
}
function checkZip(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  let total = 0,
    count = 0;
  for (let offset = 0; offset + 46 <= data.byteLength; offset++)
    if (data.getUint32(offset, true) === 0x02014b50) {
      const size = data.getUint32(offset + 24, true);
      total += size;
      count++;
      if (size > 80 * 1024 * 1024 || total > 350 * 1024 * 1024 || count > 15000)
        throw new Error(
          "El archivo comprimido es demasiado grande al descomprimirlo. Divide el libro o cómic en volúmenes.",
        );
      offset +=
        45 +
        data.getUint16(offset + 28, true) +
        data.getUint16(offset + 30, true) +
        data.getUint16(offset + 32, true);
    }
  if (!count) throw new Error("No se encontró un archivo ZIP válido.");
}
function clean(html: string) {
  const result = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "video",
      "audio",
      "source",
      "link",
      "meta",
      "base",
    ],
    FORBID_ATTR: [
      "style",
      "srcset",
      "background",
      "autofocus",
      "formaction",
      "download",
      "target",
    ],
    ALLOW_DATA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(result, "text/html");
  doc.querySelectorAll("img").forEach((image) => {
    if (
      !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(
        image.getAttribute("src") || "",
      )
    )
      image.removeAttribute("src");
  });
  doc.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("#")) a.removeAttribute("href");
  });
  return doc.body.innerHTML;
}
function splitReflow(html: string): string[] {
  const doc = new DOMParser().parseFromString(clean(html), "text/html");
  const units: string[] = [];
  let current = "",
    size = 0;
  for (const node of Array.from(doc.body.children)) {
    if (size > 10000 && (/^H[12]$/.test(node.tagName) || size > 20000)) {
      units.push(current);
      current = "";
      size = 0;
    }
    current += node.outerHTML;
    size += (node.textContent?.length || 0) + 100;
  }
  if (current) units.push(current);
  return units.length
    ? units
    : ["<p>Este documento no contiene texto visible.</p>"];
}
const imageMime = (path: string) =>
  /\.png$/i.test(path)
    ? "image/png"
    : /\.webp$/i.test(path)
      ? "image/webp"
      : /\.gif$/i.test(path)
        ? "image/gif"
        : "image/jpeg";
export async function openBook(
  document: LibraryDocument,
  signal: AbortSignal,
): Promise<ReaderBook> {
  const response = await fetch(`/api/library/${document.id}/file`, { signal });
  if (!response.ok)
    throw new Error(
      "No se pudo abrir el archivo guardado. Comprueba la carpeta de tu biblioteca.",
    );
  const buffer = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const empty = { chapters: [] as BookChapter[], cleanup: () => {} };
  if (document.format === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
    });
    signal.addEventListener("abort", () => void task.destroy(), { once: true });
    const pdf = await task.promise;
    return {
      ...empty,
      kind: "pdf",
      total: pdf.numPages,
      pdf,
      cleanup: () => void task.destroy(),
    };
  }
  if (["jpg", "jpeg", "png", "webp"].includes(document.format)) {
    const url = URL.createObjectURL(
      new Blob([buffer], { type: imageMime(document.name) }),
    );
    return {
      ...empty,
      kind: "images",
      total: 1,
      image: async () => url,
      cleanup: () => URL.revokeObjectURL(url),
    };
  }
  if (document.format === "txt" || document.format === "md") {
    const text = new TextDecoder().decode(buffer).replace(/\r\n/g, "\n");
    const units = splitReflow(
      text
        .split(/\n\s*\n/)
        .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
        .join(""),
    );
    return {
      ...empty,
      kind: "reflow",
      total: units.length,
      chapters: units.map((_, i) => ({
        title: `Sección ${i + 1}`,
        path: String(i),
      })),
      chapter: async (i) => units[i],
    };
  }
  checkZip(buffer);
  const zip = await JSZip.loadAsync(buffer);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (document.format === "docx") {
    if (!zip.file("word/document.xml"))
      throw new Error("Este archivo no contiene un documento DOCX válido.");
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const units = splitReflow(result.value);
    return {
      ...empty,
      kind: "reflow",
      total: units.length,
      chapters: units.map((_, i) => ({
        title: `Sección ${i + 1}`,
        path: String(i),
      })),
      chapter: async (i) => units[i],
    };
  }
  if (document.format === "cbz") {
    const pages = naturalPageSort(
      Object.keys(zip.files).filter(
        (name) =>
          !name.startsWith("__MACOSX/") &&
          !zip.files[name].dir &&
          /\.(png|jpe?g|webp|gif)$/i.test(name),
      ),
    );
    if (!pages.length)
      throw new Error("El CBZ no contiene imágenes JPG, PNG, WebP o GIF.");
    const urls = new Map<number, string>();
    return {
      ...empty,
      kind: "images",
      total: pages.length,
      image: async (index) => {
        if (!urls.has(index)) {
          const bytes = await zip.file(pages[index])!.async("uint8array");
          urls.set(
            index,
            URL.createObjectURL(
              new Blob([bytes as Uint8Array<ArrayBuffer>], {
                type: imageMime(pages[index]),
              }),
            ),
          );
          if (urls.size > 5) {
            const oldest = urls.keys().next().value!;
            URL.revokeObjectURL(urls.get(oldest)!);
            urls.delete(oldest);
          }
        }
        return urls.get(index)!;
      },
      cleanup: () => urls.forEach((url) => URL.revokeObjectURL(url)),
    };
  }
  const container = zip.file("META-INF/container.xml");
  if (!container)
    throw new Error("No se encontró la estructura de un EPUB válido.");
  const rootfile = xml(await container.async("string"))
    .getElementsByTagName("rootfile")[0]
    ?.getAttribute("full-path");
  if (!rootfile || !zip.file(rootfile))
    throw new Error("El EPUB no contiene su índice principal.");
  const encrypted = zip.file("META-INF/encryption.xml");
  if (encrypted) {
    const text = await encrypted.async("string");
    if (
      /EncryptedData/.test(text) &&
      !/(?:idpf.org\/2008\/embedding|ns.adobe.com\/pdf\/enc#RC)/.test(text)
    )
      throw new Error(
        "El EPUB está cifrado o protegido con DRM. Importa una copia sin DRM que tengas derecho a leer.",
      );
  }
  const opf = xml(await zip.file(rootfile)!.async("string"));
  const items = new Map(
    Array.from(opf.getElementsByTagName("item")).map((item) => [
      item.getAttribute("id")!,
      {
        path: archivePath(rootfile, item.getAttribute("href") || ""),
        properties: item.getAttribute("properties") || "",
      },
    ]),
  );
  const chapters: BookChapter[] = Array.from(
    opf.getElementsByTagName("itemref"),
  )
    .filter((ref) => ref.getAttribute("linear") !== "no")
    .map((ref, index) => ({
      title: `Capítulo ${index + 1}`,
      path: items.get(ref.getAttribute("idref")!)?.path || "",
    }))
    .filter((chapter) => !!zip.file(chapter.path));
  if (!chapters.length)
    throw new Error("El EPUB no contiene capítulos legibles.");
  const nav = Array.from(items.values()).find((item) =>
    item.properties.split(" ").includes("nav"),
  );
  if (nav?.path && zip.file(nav.path)) {
    const navDoc = new DOMParser().parseFromString(
      await zip.file(nav.path)!.async("string"),
      "text/html",
    );
    navDoc.querySelectorAll("a[href]").forEach((a) => {
      const target = archivePath(nav.path!, a.getAttribute("href")!);
      const chapter = chapters.find((c) => c.path === target);
      if (chapter && a.textContent?.trim())
        chapter.title = a.textContent.trim();
    });
  }
  return {
    ...empty,
    kind: "reflow",
    total: chapters.length,
    chapters,
    chapter: async (index) => {
      const chapter = chapters[index];
      const doc = xml(await zip.file(chapter.path)!.async("string"));
      await Promise.all(
        Array.from(doc.querySelectorAll("img")).map(async (image) => {
          const path = archivePath(
            chapter.path,
            image.getAttribute("src") || "",
          );
          image.removeAttribute("src");
          if (path && /\.(jpe?g|png|gif|webp)$/i.test(path) && zip.file(path)) {
            const data = await zip.file(path)!.async("base64");
            image.setAttribute("src", `data:${imageMime(path)};base64,${data}`);
          }
        }),
      );
      return clean(doc.getElementsByTagNameNS("*", "body")[0]?.innerHTML || "");
    },
  };
}
