import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATE_NAMES } from '@shared/protocol.js';
import { clipForState, isIdleVariant, pickIdleVariant } from '../src/renderer/rig2d/clipForState.js';
import { SPRITE_CLIPS, clipByName } from '../src/renderer/rig2d/sheetManifest.js';
import { SpritePlayer } from '../src/renderer/rig2d/spriteSheet.js';

const clip = (name: string) => {
  const found = clipByName(name);
  assert.ok(found, `expected a '${name}' clip in the sheet`);
  return found;
};

test('every state maps to a clip that exists in the generated sheet', () => {
  for (const state of STATE_NAMES) {
    const mapped = clipForState(state);
    assert.ok(clipByName(mapped.name), `${state} maps to a missing clip`);
    assert.ok(mapped.frames > 0);
    assert.ok(mapped.fps > 0);
  }
});

test('clip rows are unique and contiguous from zero', () => {
  const rows = SPRITE_CLIPS.map((c) => c.row).sort((a, b) => a - b);
  assert.deepEqual(rows, SPRITE_CLIPS.map((_, i) => i));
});

test('a looping clip steps through every frame and wraps', () => {
  const idle = clip('idle');
  // Sampled mid-frame from a fresh player each time: accumulating exactly one
  // frame's worth of dt lands on the boundary, where float error decides the
  // answer. The loop never feeds exact frame durations anyway.
  const frameAt = (elapsed: number): number => {
    const player = new SpritePlayer();
    player.play(idle);
    player.advance(elapsed, 1);
    return player.frame;
  };

  for (let i = 0; i < idle.frames; i += 1) {
    assert.equal(frameAt((i + 0.5) / idle.fps), i);
  }
  assert.equal(frameAt((idle.frames + 0.5) / idle.fps), 0, 'should have wrapped');

  const player = new SpritePlayer();
  player.play(idle);
  player.advance((idle.frames + 0.5) / idle.fps, 1);
  assert.equal(player.loops, 1);
});

test('a one-shot clip holds its last frame and reports finished', () => {
  const player = new SpritePlayer();
  const poke = clip('poke');
  player.play(poke);

  assert.equal(player.finished, false);
  player.advance((poke.frames - 1) / poke.fps, 1);
  assert.equal(player.frame, poke.frames - 1);
  assert.equal(player.finished, true);

  // Well past the end it must still hold, not wrap.
  player.advance(10, 1);
  assert.equal(player.frame, poke.frames - 1);
});

test('replaying the current clip does not restart it', () => {
  const player = new SpritePlayer();
  const idle = clip('idle');
  player.play(idle);
  player.advance(3 / idle.fps, 1);
  assert.equal(player.frame, 3);

  player.play(idle);
  assert.equal(player.frame, 3, 'a repeated state event should not stutter');

  player.play(idle, { restart: true });
  assert.equal(player.frame, 0);
});

test('zero motion holds the character still instead of freezing on a stale frame', () => {
  const player = new SpritePlayer();
  player.play(clip('idle'));
  player.advance(5, 0);
  assert.equal(player.frame, 0);
  assert.equal(player.loops, 0);
});

test('typing rate scales playback', () => {
  const typing = clip('typing');
  const slow = new SpritePlayer();
  const fast = new SpritePlayer();
  slow.play(typing);
  fast.play(typing);

  slow.advance(1, 0.5);
  fast.advance(1, 2);
  assert.ok(fast.loops > slow.loops, 'a faster rate must advance further');
});

test('idle variants are drawn from the idle family only', () => {
  const always = (value: number) => () => value;
  assert.ok(isIdleVariant(pickIdleVariant(always(0))));
  assert.ok(isIdleVariant(pickIdleVariant(always(0.99))));
  assert.equal(isIdleVariant(clip('error')), false);
});

test('the idle family contains a blink, so idle is not a single fixed loop', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i += 1) seen.add(pickIdleVariant(() => i / 40).name);
  assert.ok(seen.size > 1, `expected more than one idle variant, saw ${[...seen].join(', ')}`);
});
