/**
 * Particle effects: thought motes, success sparks, effort sweat, sleep z's.
 *
 * Emission is rate-based rather than per-frame-probability, so the effect looks
 * identical at 30 and 60 FPS. The pool is capped: a companion left running for
 * a week must not accumulate anything.
 */

import type { ParticleKind } from '@shared/states.js';

const MAX_PARTICLES = 96;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 1 at birth, 0 at death. */
  life: number;
  fade: number;
  kind: ParticleKind;
  color: string;
}

interface KindConfig {
  /** Particles per second while the state is active. */
  rate: number;
  color: string;
  spawn(x: number, y: number): Omit<Particle, 'kind' | 'color' | 'life'>;
}

const random = (min: number, max: number): number => min + Math.random() * (max - min);

const CONFIG: Record<ParticleKind, KindConfig> = {
  think: {
    rate: 13,
    color: '#9B8CD4',
    spawn: (x, y) => ({
      x: x + random(-6, 6),
      y,
      vx: random(0.15, 0.35),
      vy: random(-0.65, -0.35),
      radius: random(1.5, 4),
      fade: 0.7,
    }),
  },
  spark: {
    rate: 33,
    color: '#6FC49B',
    spawn: (x, y) => ({
      x: x + random(-45, 45),
      y: y + random(-35, 35),
      vx: random(-0.3, 0.3),
      vy: random(-0.8, -0.3),
      radius: random(1, 3),
      fade: 0.7,
    }),
  },
  sweat: {
    rate: 3,
    color: '#8FB6E0',
    spawn: (x, y) => ({ x: x + 16, y: y - 6, vx: 0.5, vy: -0.5, radius: 2.4, fade: 0.7 }),
  },
  zzz: {
    rate: 3,
    color: '#5C6884',
    spawn: (x, y) => ({ x: x + 10, y, vx: 0.25, vy: -0.3, radius: 9, fade: 0.35 }),
  },
};

/** Velocities are expressed per 60Hz frame, as in the prototype. */
const REFERENCE_FPS = 60;
const SWEAT_GRAVITY = 0.045;

export class ParticleField {
  private particles: Particle[] = [];
  private emitBudget = 0;
  private kind: ParticleKind | null = null;

  /** Switching kinds stops emission but lets existing particles finish. */
  setKind(kind: ParticleKind | null): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.emitBudget = 0;
  }

  get count(): number {
    return this.particles.length;
  }

  update(dt: number, origin: { x: number; y: number }, motion: number): void {
    if (this.kind && motion > 0.01) {
      const config = CONFIG[this.kind];
      this.emitBudget += config.rate * dt * motion;
      while (this.emitBudget >= 1) {
        this.emitBudget -= 1;
        this.spawn(this.kind, origin.x, origin.y);
      }
    }

    const step = dt * REFERENCE_FPS;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      if (!p) continue;
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.kind === 'sweat') p.vy += SWEAT_GRAVITY * step;
      p.life -= dt * p.fade;
      if (p.life <= 0) {
        // Swap-and-pop: order is irrelevant and this avoids an O(n) splice.
        const last = this.particles.pop();
        if (last && i < this.particles.length) this.particles[i] = last;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.85;
      if (p.kind === 'zzz') {
        ctx.fillStyle = p.color;
        ctx.font = `600 ${p.radius}px ui-monospace, monospace`;
        ctx.fillText('z', p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles.length = 0;
    this.emitBudget = 0;
  }

  private spawn(kind: ParticleKind, x: number, y: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    const config = CONFIG[kind];
    this.particles.push({ ...config.spawn(x, y), kind, color: config.color, life: 1 });
  }
}
