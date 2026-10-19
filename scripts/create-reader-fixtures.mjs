import { mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { createCanvas } from "@napi-rs/canvas";
const root = "artifacts/reader-fixtures";
await mkdir(root, { recursive: true });
const paragraph =
  "En la casa junto al río, cada tarde comenzaba con una página en blanco. La luz entraba despacio y dejaba sobre la mesa un espacio para imaginar. Esta es una historia original de prueba para comprobar que una lectura larga conserva su lugar, sus capítulos y sus pequeños detalles.";
const html = Array.from(
  { length: 36 },
  (_, i) => `<p>Párrafo ${i + 1}. ${paragraph}</p>`,
).join("");
await writeFile(
  `${root}/Prueba MIA - lectura larga.txt`,
  Array.from({ length: 100 }, (_, i) => `Párrafo ${i + 1}. ${paragraph}`).join(
    "\n\n",
  ),
);
const epub = new JSZip();
epub.file("mimetype", "application/epub+zip");
epub.file(
  "META-INF/container.xml",
  '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
epub.file(
  "OEBPS/content.opf",
  '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">mia-test-epub</dc:identifier><dc:title>Una casa junto al río</dc:title><dc:language>es</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    [1, 2, 3]
      .map(
        (i) =>
          `<item id="c${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`,
      )
      .join("") +
    "</manifest><spine>" +
    [1, 2, 3].map((i) => `<itemref idref="c${i}"/>`).join("") +
    "</spine></package>",
);
epub.file(
  "OEBPS/nav.xhtml",
  "<html><body><nav>" +
    [
      "Una casa junto al río",
      "La tarde que llegó una carta",
      "Un nuevo comienzo",
    ]
      .map((title, i) => `<a href="chapter${i + 1}.xhtml">${title}</a>`)
      .join("") +
    "</nav></body></html>",
);
for (let i = 1; i <= 3; i++)
  epub.file(
    `OEBPS/chapter${i}.xhtml`,
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo ${i}</title></head><body><h1>Capítulo ${i} · Una casa junto al río</h1>${html}<script>window.parent.__readerInjected=true;</script><img src="https://example.invalid/tracker.png"/><a href="javascript:alert(1)">Enlace inseguro de prueba</a></body></html>`,
  );
await writeFile(
  `${root}/Prueba MIA - historia.epub`,
  await epub.generateAsync({ type: "nodebuffer" }),
);
const docx = new JSZip();
docx.file(
  "[Content_Types].xml",
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
docx.file(
  "_rels/.rels",
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
docx.file(
  "word/document.xml",
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    Array.from(
      { length: 70 },
      (_, i) =>
        `<w:p><w:r><w:t>Párrafo ${i + 1}. ${paragraph}</w:t></w:r></w:p>`,
    ).join("") +
    "</w:body></w:document>",
);
await writeFile(
  `${root}/Prueba MIA - documento.docx`,
  await docx.generateAsync({ type: "nodebuffer" }),
);
const comic = new JSZip();
for (const i of [1, 2, 10]) {
  const canvas = createCanvas(700, 980);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f5ee";
  ctx.fillRect(0, 0, 700, 980);
  ctx.fillStyle = "#323938";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("MIA · Cómic de prueba", 45, 65);
  ctx.font = "22px sans-serif";
  ctx.fillText(`Página ${i}`, 45, 105);
  for (let y = 150; y < 850; y += 240) {
    ctx.strokeStyle = "#526762";
    ctx.lineWidth = 3;
    ctx.strokeRect(45, y, 610, 210);
    ctx.fillStyle = ["#dce5df", "#ece4d5", "#dfe5ed"][Math.floor(y / 240) % 3];
    ctx.fillRect(50, y + 5, 600, 200);
    ctx.fillStyle = "#526762";
    ctx.beginPath();
    ctx.arc(355, y + 100, 55, 0, Math.PI * 2);
    ctx.fill();
  }
  comic.file(`page-${i}.png`, canvas.toBuffer("image/png"));
}
await writeFile(
  `${root}/Prueba MIA - comic.cbz`,
  await comic.generateAsync({ type: "nodebuffer" }),
);
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
  ...Array.from(
    { length: 3 },
    (_, i) =>
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 6 0 R >> >> /Contents ${7 + i} 0 R >>`,
  ),
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ...Array.from({ length: 3 }, (_, i) => {
    const text = `BT /F1 26 Tf 55 750 Td (MIA - PDF de prueba - Pagina ${i + 1}) Tj /F1 13 Tf 0 -50 Td (Documento original para comprobar el lector y su progreso.) Tj 0 -30 Td (Vuelve a la biblioteca y comprueba que recuerde esta pagina.) Tj ET`;
    return `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  }),
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const [i, obj] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
}
const start = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
  .join(
    "",
  )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
await writeFile(`${root}/Prueba MIA - paginas.pdf`, pdf);
process.stdout.write("Cinco archivos originales de prueba creados.\n");
