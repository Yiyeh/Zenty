import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
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
  const clamp = value => Math.max(0, Math.min(1, value));
  const segment = (x, y, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * 256 / size, py = (y + 0.5) * 256 / size;
      const qx = Math.abs(px - 128) - 64, qy = Math.abs(py - 128) - 64;
      const edge = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - 48;
      const alpha = clamp(0.5 - edge * size / 256);
      const stroke = Math.min(segment(px, py, 79, 80, 178, 80), segment(px, py, 178, 80, 80, 176), segment(px, py, 80, 176, 179, 176)) - 13;
      const ink = clamp(0.5 - stroke * size / 256);
      const tile = clamp((py - 16) / 224), color = clamp((py - 80) / 96);
      const background = [38 - tile * 17, 39 - tile * 16, 55 - tile * 20];
      const foreground = [215 - color * 62, 202 - color * 73, 255 - color * 23];
      const highlight = clamp(1 - Math.abs(edge + 0.7)) * 9;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let channel = 0; channel < 3; channel++) bytes[offset + channel] = Math.round(background[channel] * (1 - ink) + foreground[channel] * ink + highlight * (1 - ink));
      bytes[offset + 3] = Math.round(alpha * 255);
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
const sizes = [256, 128, 64, 48, 32, 24, 20, 16],
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
await writeFile("desktop/icon.png", icon(512));
const ico = Buffer.concat([header, ...images]);
await writeFile("desktop/icon.ico", ico);
await writeFile("public/favicon.ico", ico);
