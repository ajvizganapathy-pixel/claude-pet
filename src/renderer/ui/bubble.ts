/**
 * The status bubble above the character.
 *
 * Text is typed out rather than swapped, which is what makes a state change
 * read as the companion noticing something instead of a label mutating.
 */

const TYPE_INTERVAL_MS = 26;
/** Below this the typing effect reads as a glitch; just show the text. */
const MIN_TYPED_LENGTH = 3;

export class Bubble {
  private timer: number | null = null;
  private current = '';
  private animate = true;

  constructor(
    private readonly root: HTMLElement,
    private readonly textEl: HTMLElement,
  ) {}

  /** Disables the typewriter for users who asked for reduced motion. */
  setAnimated(animate: boolean): void {
    this.animate = animate;
  }

  show(text: string): void {
    this.root.classList.remove('hidden');
    if (text === this.current) return;
    this.current = text;
    this.clearTimer();

    if (!this.animate || text.length < MIN_TYPED_LENGTH) {
      this.textEl.textContent = text;
      return;
    }

    let index = 0;
    this.textEl.textContent = '';
    this.timer = window.setInterval(() => {
      index += 1;
      this.textEl.textContent = text.slice(0, index);
      if (index >= text.length) this.clearTimer();
    }, TYPE_INTERVAL_MS);
  }

  hide(): void {
    this.clearTimer();
    this.root.classList.add('hidden');
  }

  destroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
