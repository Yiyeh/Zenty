import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { buildDesktopAudio } from "./desktop-audio.mjs";
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const id = Buffer.from(type),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  id.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([id, data])), data.length + 8);
  return out;
}
function icon(size) {
  const bytes = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size - 0.5,
        py = (y + 0.5) / size - 0.5;
      let distance = 1;
      for (let ray = 0; ray < 3; ray++) {
        const angle = (ray * Math.PI) / 3,
          rx = px * Math.cos(angle) + py * Math.sin(angle),
          ry = -px * Math.sin(angle) + py * Math.cos(angle);
        distance = Math.min(
          distance,
          Math.hypot(Math.max(Math.abs(rx) - 0.24, 0), ry),
        );
      }
      const ink = Math.max(0, Math.min(1, (0.043 - distance) * size + 0.5));
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      bytes[offset] = Math.round(43 + ink * 200);
      bytes[offset + 1] = Math.round(47 + ink * 197);
      bytes[offset + 2] = Math.round(57 + ink * 190);
      bytes[offset + 3] = 255;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(bytes)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
await mkdir("desktop", { recursive: true });
const sizes = [256, 128, 64, 32, 16],
  images = sizes.map(icon),
  header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const position = 6 + index * 16;
  header[position] = sizes[index] === 256 ? 0 : sizes[index];
  header[position + 1] = header[position];
  header.writeUInt16LE(1, position + 4);
  header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(image.length, position + 8);
  header.writeUInt32LE(offset, position + 12);
  offset += image.length;
});
await writeFile("desktop/icon.png", images[0]);
await writeFile("desktop/icon.ico", Buffer.concat([header, ...images]));
await buildDesktopAudio();
