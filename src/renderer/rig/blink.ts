/**
 * Blinking, kept out of the pose table because it happens *underneath* every
 * state: the character blinks while thinking, reading and typing alike.
 *
 * The cadence is random within a window so the eye never looks metronomic.
 */

const BLINK_DURATION = 0.13;
const MIN_GAP = 1.6;
const MAX_GAP = 6.1;

export class Blink {
  private untilNext = 2;
  private remaining = 0;

  /** Returns 0..1 lid closure for this frame. */
  update(dt: number): number {
    if (this.remaining > 0) {
      this.remaining -= dt;
      // A sine over the duration gives a close-and-open with no hard edges.
      const progress = 1 - Math.max(0, this.remaining) / BLINK_DURATION;
      return Math.sin(progress * Math.PI);
    }

    this.untilNext -= dt;
    if (this.untilNext <= 0) {
      this.remaining = BLINK_DURATION;
      this.untilNext = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
    }
    return 0;
  }
}
