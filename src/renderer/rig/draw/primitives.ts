/**
 * Reusable pieces of the character's silhouette.
 *
 * Everything here draws in the character's local space, where the origin is
 * the point the body sits on and negative Y is up.
 */

import { PALETTE } from '../palette.js';

export interface Point {
  x: number;
  y: number;
}

/**
 * A two-segment limb with a paw at the end. Angles are absolute radians;
 * the lower segment is drawn thinner so the leg tapers the way a real one does.
 */
export function limb(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  upperAngle: number,
  upperLength: number,
  lowerAngle: number,
  lowerLength: number,
  width: number,
  color: string,
): Point {
  const knee = {
    x: origin.x + Math.cos(upperAngle) * upperLength,
    y: origin.y + Math.sin(upperAngle) * upperLength,
  };
  const foot = {
    x: knee.x + Math.cos(lowerAngle) * lowerLength,
    y: knee.y + Math.sin(lowerAngle) * lowerLength,
  };

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();

  ctx.lineWidth = width * 0.72;
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(foot.x + 3, foot.y, width * 0.48, width * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  return foot;
}

/** A triangular ear with an inner shadow, rotated about its base. */
export function ear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-6, 6);
  ctx.lineTo(1, -11);
  ctx.lineTo(9, 4);
  ctx.quadraticCurveTo(2, 8, -6, 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.innerEar;
  ctx.beginPath();
  ctx.moveTo(-2, 4);
  ctx.lineTo(1.5, -6);
  ctx.lineTo(5.5, 3);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Soft contact shadow that grounds the character on the desktop. */
export function contactShadow(ctx: CanvasRenderingContext2D, lift: number): void {
  // A lifted body casts a smaller, fainter shadow.
  const spread = 110 - lift * 14;
  const gradient = ctx.createRadialGradient(0, 6, 2, 0, 6, spread);
  gradient.addColorStop(0, `rgba(0,0,0,${(0.55 - lift * 0.12).toFixed(3)})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 8, spread, 17, 0, 0, Math.PI * 2);
  ctx.fill();
}
