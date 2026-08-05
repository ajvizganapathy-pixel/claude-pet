/**
 * Painting the character.
 *
 * This module is a pure function of the rig's present values: given the same
 * numbers it draws the same frame, and it contains no knowledge of what state
 * the companion is in. Every expressive decision lives in a pose.
 *
 * Coordinates are in *design space* — the 360-unit-wide box the prototype was
 * drawn in — and scaled to the viewport once, at the top.
 */

import { hexAlpha } from '../../engine/math.js';
import type { Viewport } from '../../engine/surface.js';
import { PALETTE } from '../palette.js';
import type { RigValues } from '../rig.js';
import { contactShadow, ear, limb, type Point } from './primitives.js';

/** The box the character was designed in. */
const DESIGN_WIDTH = 360;
const DESIGN_HEIGHT = 340;
/** Distance from the character's feet to the bottom of the canvas, in design units. */
const FLOOR_INSET = 48;

export interface CharacterFrame {
  rig: RigValues;
  /** Seconds since the scene started; drives the cyclic motion. */
  time: number;
  /** Global motion multiplier; 0 stills the cycles without changing the pose. */
  motion: number;
  /** State accent colour, used for the ambient glow. */
  accent: string;
}

export interface CharacterAnchors {
  /** Canvas-space point just above the head, where particles are emitted. */
  head: Point;
  /** Canvas-space centre of the body. */
  body: Point;
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  frame: CharacterFrame,
): CharacterAnchors {
  const { rig, time, motion, accent } = frame;
  // Fit by whichever axis is tighter, so a short or narrow viewport crops
  // nothing. In the overlay both axes agree and this is just `width / 360`.
  const scale = Math.min(view.width / DESIGN_WIDTH, view.height / DESIGN_HEIGHT);

  const breath = Math.sin(time * 1.5) * 2.2 * rig.breathAmp * motion;
  const bodyLift = -rig.crouch * 16 + breath * 0.4;
  const originX = view.width / 2 + rig.driftX * scale;
  const originY = view.height - FLOOR_INSET * scale;

  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);

  contactShadow(ctx, Math.max(0, -rig.crouch));
  drawGlow(ctx, rig.glow, accent);

  ctx.translate(0, bodyLift);

  drawTail(ctx, rig, time, motion);
  drawLegs(ctx, rig, time, motion, 'far');
  drawTorso(ctx, breath);
  drawLegs(ctx, rig, time, motion, 'near');
  drawHead(ctx, rig, breath);

  ctx.restore();

  const headLocal = { x: 56 + rig.headYaw * 11, y: -104 + rig.headPitch * 10 + bodyLift };
  return {
    head: { x: originX + headLocal.x * scale, y: originY + headLocal.y * scale },
    body: { x: originX, y: originY + (-82 + bodyLift) * scale },
  };
}

function drawGlow(ctx: CanvasRenderingContext2D, glow: number, accent: string): void {
  if (glow <= 0.01) return;
  const gradient = ctx.createRadialGradient(0, -90, 10, 0, -90, 150);
  gradient.addColorStop(0, hexAlpha(accent, 0.16 * glow));
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, -90, 150, 0, Math.PI * 2);
  ctx.fill();
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  rig: RigValues,
  time: number,
  motion: number,
): void {
  const sway = Math.sin(time * rig.tailSpeed * 2) * rig.tailAmp * motion;
  const tipX = -120 + sway * 46;
  const tipY = -18 - rig.tailLift * 80 + sway * 34;

  ctx.strokeStyle = PALETTE.furShadow;
  ctx.lineCap = 'round';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(-62, -72);
  ctx.bezierCurveTo(
    -100,
    -78 - rig.tailLift * 26,
    -128 + sway * 30,
    -52 - rig.tailLift * 58 + sway * 20,
    tipX,
    tipY,
  );
  ctx.stroke();

  // The dark tip reads as a separate mass and sells the whip at the end.
  ctx.lineWidth = 7;
  ctx.strokeStyle = PALETTE.furDark;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(-116 + sway * 54, -6 - rig.tailLift * 88 + sway * 40);
  ctx.stroke();
}

function drawLegs(
  ctx: CanvasRenderingContext2D,
  rig: RigValues,
  time: number,
  motion: number,
  layer: 'far' | 'near',
): void {
  const gait = Math.sin(time * 2.6) * rig.walkAmp * motion;
  const paw = Math.sin(time * rig.pawSpeed) * rig.pawAmp * motion;
  // The far front paw trails the near one, which is what makes typing read as
  // two paws rather than one mirrored pair.
  const pawOffset = Math.sin(time * rig.pawSpeed + 2.4) * rig.pawAmp * motion;

  if (layer === 'far') {
    limb(ctx, { x: -52, y: -70 }, 1.35 + gait * 0.5, 34, 1.62 - gait * 0.4, 34, 15, PALETTE.furDark);
    limb(
      ctx,
      { x: 40, y: -76 },
      1.48 - gait * 0.5 - pawOffset * 0.3,
      32,
      1.6 + pawOffset * 0.16,
      32,
      14,
      PALETTE.furDark,
    );
    return;
  }

  limb(ctx, { x: -48, y: -68 }, 1.3 - gait * 0.5, 34, 1.66 + gait * 0.4, 34, 16, PALETTE.fur);
  limb(
    ctx,
    { x: 44, y: -74 },
    1.46 + gait * 0.5 - paw * 0.42 - rig.scratch * 1.0,
    31,
    1.58 + paw * 0.24 - rig.scratch * 0.5,
    31,
    15,
    PALETTE.furHighlight,
  );
}

function drawTorso(ctx: CanvasRenderingContext2D, breath: number): void {
  const gradient = ctx.createLinearGradient(0, -118, 0, -40);
  gradient.addColorStop(0, PALETTE.furHighlight);
  gradient.addColorStop(0.55, PALETTE.fur);
  gradient.addColorStop(1, PALETTE.furShadow);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-64, -70);
  ctx.bezierCurveTo(-72, -104 - breath * 0.5, -30, -116 - breath, 16, -112 - breath);
  ctx.bezierCurveTo(46, -110, 62, -100, 64, -82);
  ctx.bezierCurveTo(66, -62, 40, -52, 4, -52);
  ctx.bezierCurveTo(-34, -52, -58, -56, -64, -70);
  ctx.closePath();
  ctx.fill();

  // Rim light along the spine — the cold room, the warm animal.
  ctx.strokeStyle = PALETTE.rim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-62, -74);
  ctx.bezierCurveTo(-70, -104 - breath * 0.5, -30, -116 - breath, 16, -112 - breath);
  ctx.bezierCurveTo(40, -110, 56, -102, 62, -88);
  ctx.stroke();
}

function drawHead(ctx: CanvasRenderingContext2D, rig: RigValues, breath: number): void {
  ctx.save();
  ctx.translate(56, -104);
  ctx.rotate(rig.headTilt * 0.7);
  ctx.translate(rig.headYaw * 11, rig.headPitch * 10 + breath * 0.3);

  // neck wedge
  ctx.fillStyle = PALETTE.fur;
  ctx.beginPath();
  ctx.moveTo(-16, 10);
  ctx.quadraticCurveTo(-4, -6, 14, -8);
  ctx.lineTo(16, 14);
  ctx.quadraticCurveTo(0, 20, -16, 10);
  ctx.closePath();
  ctx.fill();

  ear(ctx, -6, -30, -0.55 + rig.earB, PALETTE.furShadow);
  ear(ctx, 14, -32, 0.1 + rig.earA, PALETTE.fur);

  const skull = ctx.createLinearGradient(0, -30, 0, 18);
  skull.addColorStop(0, PALETTE.furHighlight);
  skull.addColorStop(0.6, PALETTE.fur);
  skull.addColorStop(1, PALETTE.furShadow);
  ctx.fillStyle = skull;
  ctx.beginPath();
  ctx.moveTo(-14, -8);
  ctx.bezierCurveTo(-16, -30, 8, -36, 22, -26);
  ctx.bezierCurveTo(36, -18, 40, -6, 38, 2);
  ctx.bezierCurveTo(36, 12, 20, 18, 2, 16);
  ctx.bezierCurveTo(-10, 14, -14, 4, -14, -8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.muzzle;
  ctx.beginPath();
  ctx.ellipse(31, 4, 10, 7.5, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.nose;
  ctx.beginPath();
  ctx.ellipse(38, -0.5, 2.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (rig.mouth > 0.02) {
    ctx.fillStyle = PALETTE.mouth;
    ctx.beginPath();
    ctx.ellipse(32, 9, 6.5, 1.5 + rig.mouth * 5, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSabers(ctx);
  drawBrow(ctx, rig.brow);
  drawEye(ctx, rig, skull);

  ctx.restore();
}

/** The sabers are the whole silhouette read; they never move. */
function drawSabers(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PALETTE.saber;
  for (const index of [0, 1]) {
    const x = 30 - index * 6;
    const y = 8 + index;
    ctx.beginPath();
    ctx.moveTo(x - 2.6, y);
    ctx.lineTo(x + 2.4, y);
    ctx.quadraticCurveTo(x + 1.4, y + 18, x - 1.6, y + 21);
    ctx.closePath();
    ctx.globalAlpha = index ? 0.55 : 1;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBrow(ctx: CanvasRenderingContext2D, brow: number): void {
  ctx.strokeStyle = PALETTE.furDark;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, -13 + brow * 3.5);
  ctx.lineTo(24, -16 + brow * 4.5);
  ctx.stroke();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  rig: RigValues,
  lidFill: CanvasGradient,
): void {
  const x = 19;
  const y = -5;

  ctx.fillStyle = PALETTE.sclera;
  ctx.beginPath();
  ctx.ellipse(x, y, 6.6, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();

  const irisX = x + rig.eyeX * 2.6;
  const irisY = y + rig.eyeY * 2.0;
  const iris = ctx.createRadialGradient(irisX - 1, irisY - 1, 0.5, irisX, irisY, 4.6);
  iris.addColorStop(0, PALETTE.irisInner);
  iris.addColorStop(1, PALETTE.irisOuter);
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(irisX, irisY, 4.4, 0, Math.PI * 2);
  ctx.fill();

  // The pupil narrows as the character lights up — alert, not sleepy.
  ctx.fillStyle = PALETTE.pupil;
  ctx.beginPath();
  ctx.ellipse(irisX, irisY, 1.5 + (1 - rig.glow) * 0.5, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.specularWarm;
  ctx.beginPath();
  ctx.arc(irisX - 1.7, irisY - 2, 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.specularCool;
  ctx.beginPath();
  ctx.arc(irisX + 1.9, irisY + 1.6, 0.8, 0, Math.PI * 2);
  ctx.fill();

  if (rig.lid > 0.02) {
    ctx.fillStyle = lidFill;
    ctx.beginPath();
    ctx.ellipse(x, y - 6 + rig.lid * 6.2, 7.2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
