// A very small anti-aliased rasteriser and PNG writer, shared by the sprite
// generator. Deliberately dependency-free, for the same reason the icons are:
// the artwork is code, so regenerating at a new size is a one-line change and
// there is no binary asset that can drift away from the palette.
//
// Shapes are `{ bbox, inside }` pairs rather than paths. Coverage is sampled on
// a sub-grid inside the bounding box only, which is what keeps a full sheet in
// the low seconds rather than the low minutes.

import { deflateSync } from 'node:zlib';

/** Sub-samples per axis. 4 is the point where stair-stepping stops reading. */
const SUB = 4;

export class Bitmap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  blend(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const dstA = this.data[i + 3] / 255;
    const outA = alpha + dstA * (1 - alpha);
    if (outA <= 0) return;
    const src = [r, g, b];
    for (let c = 0; c < 3; c += 1) {
      const dst = this.data[i + c];
      this.data[i + c] = (src[c] * alpha + dst * dstA * (1 - alpha)) / outA;
    }
    this.data[i + 3] = outA * 255;
  }

  /** Fills one shape, sampling coverage only within its bounding box. */
  fill(color, shape, opacity = 1) {
    const { bbox, inside } = shape;
    const x0 = Math.max(0, Math.floor(bbox.x0));
    const y0 = Math.max(0, Math.floor(bbox.y0));
    const x1 = Math.min(this.width - 1, Math.ceil(bbox.x1));
    const y1 = Math.min(this.height - 1, Math.ceil(bbox.y1));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        let hits = 0;
        for (let sy = 0; sy < SUB; sy += 1) {
          for (let sx = 0; sx < SUB; sx += 1) {
            if (inside(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB)) hits += 1;
          }
        }
        if (hits > 0) this.blend(x, y, color, (hits / (SUB * SUB)) * opacity);
      }
    }
  }

  /** Copies this bitmap into `target` with its top-left at (dx, dy). */
  blitInto(target, dx, dy) {
    for (let y = 0; y < this.height; y += 1) {
      const ty = dy + y;
      if (ty < 0 || ty >= target.height) continue;
      for (let x = 0; x < this.width; x += 1) {
        const tx = dx + x;
        if (tx < 0 || tx >= target.width) continue;
        const si = (y * this.width + x) * 4;
        const ti = (ty * target.width + tx) * 4;
        for (let c = 0; c < 4; c += 1) target.data[ti + c] = this.data[si + c];
      }
    }
  }
}

// ---- shapes -----------------------------------------------------------------

/** An ellipse, optionally rotated about its own centre. */
export function ellipse(cx, cy, rx, ry, rot = 0) {
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  // Rotated axis-aligned extent, so the bounding box stays tight but sufficient.
  const ex = Math.hypot(rx * cos, ry * sin);
  const ey = Math.hypot(rx * sin, ry * cos);
  return {
    bbox: { x0: cx - ex, y0: cy - ey, x1: cx + ex, y1: cy + ey },
    inside(x, y) {
      const dx = x - cx;
      const dy = y - cy;
      const px = dx * cos - dy * sin;
      const py = dx * sin + dy * cos;
      return (px * px) / (rx * rx) + (py * py) / (ry * ry) <= 1;
    },
  };
}

export const circle = (cx, cy, r) => ellipse(cx, cy, r, r);

/** A thick line with round caps — limbs, tails, eyebrows, mouth strokes. */
export function capsule(ax, ay, bx, by, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1e-6;
  return {
    bbox: {
      x0: Math.min(ax, bx) - radius,
      y0: Math.min(ay, by) - radius,
      x1: Math.max(ax, bx) + radius,
      y1: Math.max(ay, by) + radius,
    },
    inside(x, y) {
      let t = ((x - ax) * dx + (y - ay) * dy) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = x - (ax + t * dx);
      const py = y - (ay + t * dy);
      return px * px + py * py <= radius * radius;
    },
  };
}

/** A quadratic Bézier stroked with round caps, flattened into capsules. */
export function curve(ax, ay, cxp, cyp, bx, by, radius, steps = 14) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * ax + 2 * u * t * cxp + t * t * bx,
      u * u * ay + 2 * u * t * cyp + t * t * by,
    ]);
  }
  const segments = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    segments.push(capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], radius));
  }
  return union(segments);
}

export function triangle(ax, ay, bx, by, cx, cy) {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  return {
    bbox: {
      x0: Math.min(ax, bx, cx),
      y0: Math.min(ay, by, cy),
      x1: Math.max(ax, bx, cx),
      y1: Math.max(ay, by, cy),
    },
    inside(x, y) {
      const d1 = sign(x, y, ax, ay, bx, by);
      const d2 = sign(x, y, bx, by, cx, cy);
      const d3 = sign(x, y, cx, cy, ax, ay);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    },
  };
}

export function union(shapes) {
  const list = shapes.filter(Boolean);
  return {
    bbox: {
      x0: Math.min(...list.map((s) => s.bbox.x0)),
      y0: Math.min(...list.map((s) => s.bbox.y0)),
      x1: Math.max(...list.map((s) => s.bbox.x1)),
      y1: Math.max(...list.map((s) => s.bbox.y1)),
    },
    inside(x, y) {
      for (const s of list) if (s.inside(x, y)) return true;
      return false;
    },
  };
}

/** `shape` minus `cut` — used for crescent highlights and clipped stripes. */
export function subtract(shape, cut) {
  return {
    bbox: shape.bbox,
    inside: (x, y) => shape.inside(x, y) && !cut.inside(x, y),
  };
}

/** `shape` restricted to `mask` — keeps stripes inside the body outline. */
export function intersect(shape, mask) {
  return {
    bbox: {
      x0: Math.max(shape.bbox.x0, mask.bbox.x0),
      y0: Math.max(shape.bbox.y0, mask.bbox.y0),
      x1: Math.min(shape.bbox.x1, mask.bbox.x1),
      y1: Math.min(shape.bbox.y1, mask.bbox.y1),
    },
    inside: (x, y) => shape.inside(x, y) && mask.inside(x, y),
  };
}

/** Grows a shape outward by `amount`, for drawing cartoon outlines behind fills. */
export function outset(shape, amount) {
  const step = amount;
  const offsets = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    offsets.push([Math.cos(a) * step, Math.sin(a) * step]);
  }
  return {
    bbox: {
      x0: shape.bbox.x0 - step,
      y0: shape.bbox.y0 - step,
      x1: shape.bbox.x1 + step,
      y1: shape.bbox.y1 + step,
    },
    inside(x, y) {
      if (shape.inside(x, y)) return true;
      for (const [ox, oy] of offsets) if (shape.inside(x - ox, y - oy)) return true;
      return false;
    },
  };
}

// ---- PNG --------------------------------------------------------------------

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

export function encodePng(bitmap) {
  const { width, height, data } = bitmap;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 1; // filter: Sub — cheap, and sprite rows are flat
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const here = data[y * stride + x];
      const left = x >= 4 ? data[y * stride + x - 4] : 0;
      raw[row + x] = (here - left) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
