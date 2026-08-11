// The companion's artwork: an original chunky orange-tabby cartoon cat, drawn
// as flat shapes with heavy outlines so it reads as clip art rather than as a
// render.
//
// One function, `drawCat`, paints a single frame from a flat pose object. The
// clip table in `generate-sprites.mjs` supplies a pose per frame, so every
// animation in the sheet is this same drawing with different numbers — the same
// arrangement the runtime rig uses, just baked ahead of time.
//
// Coordinates are normalised to the frame (0..1, y down) and scaled on the way
// in, so the sheet can be regenerated at any resolution without touching the
// artwork.

import { Bitmap, capsule, circle, curve, ellipse, intersect, outset, subtract, triangle, union } from './raster.mjs';

export const PALETTE = {
  ink: [0x3f, 0x25, 0x14],
  fur: [0xf2, 0x99, 0x3d],
  furShade: [0xd9, 0x7a, 0x28],
  stripe: [0xc2, 0x62, 0x1c],
  cream: [0xfb, 0xe6, 0xc4],
  creamShade: [0xef, 0xd0, 0xa4],
  eyeWhite: [0xff, 0xfb, 0xf2],
  iris: [0x6f, 0xa8, 0x3c],
  pupil: [0x2a, 0x1a, 0x10],
  nose: [0xe1, 0x74, 0x6d],
  tongue: [0xe0, 0x6b, 0x74],
  inner: [0xe9, 0x9b, 0x93],
};

/** Every channel the artwork understands, with its resting value. */
export const REST_POSE = {
  /** Whole-character offset and vertical squash, in frame units. */
  bodyX: 0,
  bodyY: 0,
  squash: 0,
  /** Head offset and tilt (radians). */
  headX: 0,
  headY: 0,
  headTilt: 0,
  /** Ear splay; 1 is upright, 0 is flat against the skull. */
  ears: 1,
  /** Eyelid closure, 0 open … 1 shut. */
  lid: 0,
  /** Happy closed-eye arcs instead of open eyes. */
  smileEyes: 0,
  /** Pupil offset within the eye, in eye radii. */
  pupilX: 0,
  pupilY: 0,
  /** Brow angle; positive is worried, negative is cross. */
  brow: 0,
  /** Mouth opening, 0 closed … 1 wide. */
  mouth: 0,
  /** Mouth corner lift; positive smiles, negative frowns. */
  smile: 0,
  /** Tail sweep and lift. */
  tailSweep: 0,
  tailLift: 0,
  /** Front paw heights, 0 down … 1 raised. */
  pawL: 0,
  pawR: 0,
  /** Pulls a paw up to the chin (thinking). */
  chinPaw: 0,
};

/**
 * Paints one frame.
 *
 * @param {number} size frame edge in pixels
 * @param {Partial<typeof REST_POSE>} input
 * @returns {Bitmap}
 */
export function drawCat(size, input = {}) {
  const p = { ...REST_POSE, ...input };
  const bmp = new Bitmap(size, size);

  // Normalised helpers: `u` converts frame units to pixels.
  const u = (n) => n * size;
  const ink = PALETTE.ink;
  const line = u(0.017);

  // Breathing squashes vertically and widens horizontally, conserving bulk so
  // the silhouette never appears to change mass.
  const sy = 1 - p.squash;
  const sx = 1 + p.squash * 0.7;

  const ox = u(p.bodyX);
  const oy = u(p.bodyY);

  /** Body-space point → pixels. Scaling is about the floor, so feet stay put. */
  const FLOOR = 0.93;
  const bx = (x) => ox + u(0.5 + (x - 0.5) * sx);
  const by = (y) => oy + u(FLOOR + (y - FLOOR) * sy);
  const br = (r) => u(r) * ((sx + sy) / 2);

  /** Head-space point → pixels, applying the head's own offset and tilt. */
  const HEAD = { x: 0.5, y: 0.395 };
  const cos = Math.cos(p.headTilt);
  const sin = Math.sin(p.headTilt);
  const hx = (x, y) => {
    const dx = x - HEAD.x;
    const dy = y - HEAD.y;
    return bx(HEAD.x + p.headX + dx * cos - dy * sin);
  };
  const hy = (x, y) => {
    const dx = x - HEAD.x;
    const dy = y - HEAD.y;
    return by(HEAD.y + p.headY + dx * sin + dy * cos);
  };

  const outlined = (shape, color, width = line) => {
    bmp.fill(ink, outset(shape, width));
    bmp.fill(color, shape);
  };

  // ---- tail ---------------------------------------------------------------
  // Behind everything, sweeping out to the character's left so it never
  // overlaps the status bubble anchored above the head.
  {
    const baseX = bx(0.70);
    const baseY = by(0.80);
    const tipX = bx(0.86 + p.tailSweep * 0.10);
    const tipY = by(0.50 - p.tailLift * 0.14 + p.tailSweep * 0.06);
    const ctlX = bx(0.94 + p.tailSweep * 0.06);
    const ctlY = by(0.74 - p.tailLift * 0.06);
    const tail = curve(baseX, baseY, ctlX, ctlY, tipX, tipY, br(0.048));
    outlined(tail, PALETTE.fur);
    // Two bands, clipped to the tail so they follow its curve.
    for (const t of [0.45, 0.78]) {
      const px = (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * ctlX + t * t * tipX;
      const py = (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * ctlY + t * t * tipY;
      bmp.fill(PALETTE.stripe, intersect(circle(px, py, br(0.034)), tail));
    }
    bmp.fill(PALETTE.cream, intersect(circle(tipX, tipY, br(0.034)), tail));
  }

  // ---- body ---------------------------------------------------------------
  const body = ellipse(bx(0.5), by(0.735), br(0.238), br(0.180));
  outlined(body, PALETTE.fur);
  // Cream front, kept inside the body so no outline runs through the middle.
  bmp.fill(PALETTE.cream, intersect(ellipse(bx(0.5), by(0.790), br(0.150), br(0.120)), body));
  // Back stripes.
  for (const [x, r] of [[0.34, 0.030], [0.30, 0.024]]) {
    bmp.fill(PALETTE.stripe, intersect(ellipse(bx(x), by(0.700), br(r), br(0.075)), body));
  }

  // ---- hind feet ----------------------------------------------------------
  for (const x of [0.335, 0.665]) {
    outlined(ellipse(bx(x), by(0.888), br(0.072), br(0.046)), PALETTE.cream);
  }

  // ---- front paws ---------------------------------------------------------
  // `chinPaw` takes the left paw off the floor and parks it against the cheek.
  // Left, not right: the tail sweeps out to the right, and two limbs crossing
  // the same quadrant reads as a tangle at this size.
  const paws = [
    { x: 0.415, lift: p.pawL, chin: p.chinPaw },
    { x: 0.585, lift: p.pawR, chin: 0 },
  ];
  for (const paw of paws) {
    const restX = bx(paw.x);
    const restY = by(0.868 - paw.lift * 0.16);
    // Against the side of the cheek rather than under the muzzle, so the paw
    // props the chin up instead of covering the mouth.
    const chinX = hx(0.292, 0.540);
    const chinY = hy(0.292, 0.540);
    const px = restX + (chinX - restX) * paw.chin;
    const py = restY + (chinY - restY) * paw.chin;

    // The shoulder rides up with the paw; anchoring the forearm to the floor
    // instead would draw a bar straight across the belly.
    const shoulderX = bx(paw.x + (paw.x - 0.5) * 0.55 * (paw.lift + paw.chin));
    const shoulderY = by(0.855 - (paw.lift * 0.06 + paw.chin * 0.115));
    if (paw.lift > 0.05 || paw.chin > 0.05) {
      outlined(capsule(shoulderX, shoulderY, px, py, br(0.038)), PALETTE.fur);
    }
    outlined(ellipse(px, py, br(0.060), br(0.048)), PALETTE.cream);
  }

  // ---- ears ---------------------------------------------------------------
  // Drawn before the skull so the skull's outline closes their bases.
  for (const side of [-1, 1]) {
    // Flattening rotates the ear outward and down rather than shrinking it, so
    // "ears back" reads as a pose instead of as the ear disappearing.
    const droop = 1 - p.ears;
    const innerX = 0.5 + side * 0.105;
    const outerX = 0.5 + side * (0.255 + droop * 0.085);
    const tipX = 0.5 + side * (0.235 + droop * 0.150);
    const tipY = 0.075 + droop * 0.185;
    const ear = triangle(
      hx(innerX, 0.255), hy(innerX, 0.255),
      hx(tipX, tipY), hy(tipX, tipY),
      hx(outerX, 0.330), hy(outerX, 0.330),
    );
    outlined(ear, PALETTE.fur);
    // The inner ear is the same triangle pulled in towards its centroid.
    const cxE = (innerX + tipX + outerX) / 3;
    const cyE = (0.255 + tipY + 0.330) / 3;
    const pull = (x, y, k) => [cxE + (x - cxE) * k, cyE + (y - cyE) * k];
    const [ax, ay] = pull(innerX, 0.255, 0.52);
    const [tx, ty] = pull(tipX, tipY, 0.62);
    const [gx, gy] = pull(outerX, 0.330, 0.52);
    bmp.fill(PALETTE.inner, triangle(hx(ax, ay), hy(ax, ay), hx(tx, ty), hy(tx, ty), hx(gx, gy), hy(gx, gy)));
  }

  // ---- head ---------------------------------------------------------------
  const head = ellipse(hx(0.5, 0.395), hy(0.5, 0.395), br(0.268), br(0.232), p.headTilt);
  outlined(head, PALETTE.fur);

  // Forehead stripes — the tabby "M", the thing that makes the shape read as a
  // tabby rather than as a generic orange cat.
  for (const [x, w] of [[0.5, 0.022], [0.415, 0.019], [0.585, 0.019]]) {
    bmp.fill(
      PALETTE.stripe,
      intersect(ellipse(hx(x, 0.245), hy(x, 0.245), br(w), br(0.048), p.headTilt), head),
    );
  }

  // ---- muzzle -------------------------------------------------------------
  const cheekL = ellipse(hx(0.428, 0.487), hy(0.428, 0.487), br(0.092), br(0.076), p.headTilt);
  const cheekR = ellipse(hx(0.572, 0.487), hy(0.572, 0.487), br(0.092), br(0.076), p.headTilt);
  const muzzle = union([cheekL, cheekR]);
  bmp.fill(ink, subtract(outset(muzzle, line * 0.8), muzzle));
  bmp.fill(PALETTE.cream, muzzle);

  // Whisker dots, three per cheek.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const dx = 0.5 + side * (0.052 + (i % 2) * 0.030);
      const dy = 0.462 + i * 0.026;
      bmp.fill(PALETTE.furShade, circle(hx(dx, dy), hy(dx, dy), br(0.0085)));
    }
  }

  // ---- nose and mouth -----------------------------------------------------
  const noseY = 0.443;
  outlined(
    triangle(
      hx(0.462, noseY - 0.014), hy(0.462, noseY - 0.014),
      hx(0.538, noseY - 0.014), hy(0.538, noseY - 0.014),
      hx(0.5, noseY + 0.030), hy(0.5, noseY + 0.030),
    ),
    PALETTE.nose,
    line * 0.55,
  );

  {
    // The classic two-arc cat mouth, opening into an oval as `mouth` rises.
    const topY = noseY + 0.034;
    const drop = 0.030 + p.smile * -0.014;
    if (p.mouth > 0.06) {
      const openR = 0.026 + p.mouth * 0.052;
      const mouthShape = ellipse(
        hx(0.5, topY + openR * 0.62), hy(0.5, topY + openR * 0.62),
        br(0.044 + p.mouth * 0.022), br(openR), p.headTilt,
      );
      outlined(mouthShape, PALETTE.ink, line * 0.5);
      bmp.fill(PALETTE.tongue, ellipse(
        hx(0.5, topY + openR * 0.95), hy(0.5, topY + openR * 0.95),
        br(0.030 + p.mouth * 0.014), br(openR * 0.5), p.headTilt,
      ));
    } else {
      for (const side of [-1, 1]) {
        const endX = 0.5 + side * 0.062;
        bmp.fill(PALETTE.ink, curve(
          hx(0.5, topY), hy(0.5, topY),
          hx(0.5 + side * 0.030, topY + drop), hy(0.5 + side * 0.030, topY + drop),
          hx(endX, topY + drop * 0.55), hy(endX, topY + drop * 0.55),
          line * 0.42,
        ));
      }
    }
  }

  // ---- eyes ---------------------------------------------------------------
  for (const side of [-1, 1]) {
    const ex = 0.5 + side * 0.108;
    const ey = 0.322;
    const cx = hx(ex, ey);
    const cy = hy(ex, ey);
    const rx = br(0.083);
    const ry = br(0.098);

    if (p.smileEyes > 0.5) {
      // A closed happy arc, drawn as a stroke rather than a filled eye.
      bmp.fill(PALETTE.ink, curve(
        cx - rx, cy + ry * 0.25,
        cx, cy - ry * 0.75,
        cx + rx, cy + ry * 0.25,
        line * 0.62,
      ));
      continue;
    }

    const eye = ellipse(cx, cy, rx, ry, p.headTilt);
    bmp.fill(ink, subtract(outset(eye, line * 0.85), eye));
    bmp.fill(PALETTE.eyeWhite, eye);

    const px = cx + p.pupilX * rx * 0.42;
    const py = cy + p.pupilY * ry * 0.40;
    bmp.fill(PALETTE.iris, intersect(ellipse(px, py, rx * 0.62, ry * 0.66, p.headTilt), eye));
    bmp.fill(PALETTE.pupil, intersect(ellipse(px, py, rx * 0.30, ry * 0.46, p.headTilt), eye));
    bmp.fill(PALETTE.eyeWhite, intersect(circle(px - rx * 0.22, py - ry * 0.30, rx * 0.20), eye));

    // The lid closes from the top, and takes the eye's outline down with it.
    if (p.lid > 0.02) {
      const lidY = cy - ry + 2 * ry * p.lid;
      const cover = ellipse(cx, lidY - ry, rx * 1.14, ry, p.headTilt);
      bmp.fill(PALETTE.fur, intersect(cover, outset(eye, line)));
      bmp.fill(PALETTE.ink, intersect(
        capsule(cx - rx, lidY, cx + rx, lidY, line * 0.5),
        outset(eye, line),
      ));
    }

    // Brows sit above the eye and are the cheapest expression channel there is.
    if (Math.abs(p.brow) > 0.02) {
      const tilt = p.brow * 0.055 * side;
      bmp.fill(PALETTE.stripe, capsule(
        cx - rx * 0.85, cy - ry * 1.30 - br(tilt),
        cx + rx * 0.85, cy - ry * 1.30 + br(tilt),
        line * 0.55,
      ));
    }
  }

  return bmp;
}
