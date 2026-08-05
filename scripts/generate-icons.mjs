// Generates the tray and application icons.
//
// The artwork is code for the same reason the character is: there is no binary
// asset to keep in step with the palette, and regenerating at a new size is a
// one-line change. Run via `npm run icons`; output lands in `assets/`.

import { deflateSync } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './bundles.mjs';

const OUT_DIR = path.join(root, 'assets');

const COLORS = {
  fur: [0xb9, 0x6f, 0x44],
  furDark: [0x6d, 0x3b, 0x26],
  saber: [0xf3, 0xef, 0xe6],
  eye: [0xf0, 0xc4, 0x6b],
};

/** A tiny RGBA canvas with just the primitives the glyph needs. */
class Bitmap {
  constructor(size) {
    this.size = size;
    this.data = new Uint8ClampedArray(size * size * 4);
  }

  blend(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const dstA = this.data[i + 3] / 255;
    const outA = alpha + dstA * (1 - alpha);
    if (outA <= 0) return;
    for (let c = 0; c < 3; c += 1) {
      const dst = this.data[i + c];
      this.data[i + c] = (([r, g, b][c] * alpha + dst * dstA * (1 - alpha)) / outA) | 0;
    }
    this.data[i + 3] = (outA * 255) | 0;
  }

  /** Anti-aliased by sampling coverage on a 3x3 sub-grid. */
  fill(color, inside) {
    const s = this.size;
    for (let y = 0; y < s; y += 1) {
      for (let x = 0; x < s; x += 1) {
        let hits = 0;
        for (let sy = 0; sy < 3; sy += 1) {
          for (let sx = 0; sx < 3; sx += 1) {
            if (inside((x + (sx + 0.5) / 3) / s, (y + (sy + 0.5) / 3) / s)) hits += 1;
          }
        }
        if (hits > 0) this.blend(x, y, color, hits / 9);
      }
    }
  }
}

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const triangle = (ax, ay, bx, by, cx, cy) => (x, y) => {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = sign(x, y, ax, ay, bx, by);
  const d2 = sign(x, y, bx, by, cx, cy);
  const d3 = sign(x, y, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
};

/** The glyph: a saber-toothed head, readable down to 16 pixels. */
function drawGlyph(size) {
  const bmp = new Bitmap(size);
  bmp.fill(COLORS.furDark, triangle(0.16, 0.42, 0.28, 0.05, 0.46, 0.34)); // left ear
  bmp.fill(COLORS.furDark, triangle(0.84, 0.42, 0.72, 0.05, 0.54, 0.34)); // right ear
  bmp.fill(COLORS.fur, circle(0.5, 0.52, 0.36)); // skull
  bmp.fill(COLORS.eye, circle(0.37, 0.47, 0.07));
  bmp.fill(COLORS.eye, circle(0.63, 0.47, 0.07));
  // Wide bases: at 16 pixels a thin taper disappears into anti-aliasing.
  bmp.fill(COLORS.saber, triangle(0.34, 0.6, 0.46, 0.6, 0.41, 0.88)); // left saber
  bmp.fill(COLORS.saber, triangle(0.54, 0.6, 0.66, 0.6, 0.59, 0.88)); // right saber
  return bmp;
}

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(bitmap) {
  const { size, data } = bitmap;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(data.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO with PNG-compressed entries, which Windows has accepted since Vista. */
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const directory = Buffer.alloc(16 * pngs.length);
  let offset = header.length + directory.length;

  pngs.forEach(({ size, png }, index) => {
    const entry = index * 16;
    directory[entry] = size >= 256 ? 0 : size;
    directory[entry + 1] = size >= 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32BE(0, entry + 8);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...pngs.map((p) => p.png)]);
}

// ---- output -----------------------------------------------------------------

await fs.mkdir(OUT_DIR, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 256];
const rendered = sizes.map((size) => ({ size, png: encodePng(drawGlyph(size)) }));

for (const size of [16, 32]) {
  const entry = rendered.find((r) => r.size === size);
  await fs.writeFile(path.join(OUT_DIR, `tray-${size}.png`), entry.png);
}
await fs.writeFile(path.join(OUT_DIR, 'icon.png'), rendered.at(-1).png);
await fs.writeFile(path.join(OUT_DIR, 'icon.ico'), encodeIco(rendered));

console.log(`saber: icons written to ${path.relative(root, OUT_DIR)}`);
