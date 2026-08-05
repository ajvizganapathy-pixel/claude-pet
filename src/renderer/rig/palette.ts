/**
 * The character's colours, lifted from the prototype.
 *
 * Warm animal against a cold room: the fur ramp is saturated and the rim light
 * is a desaturated blue, which is what keeps the cat legible on any wallpaper.
 */

export const PALETTE = {
  furHighlight: '#E3A672',
  fur: '#B96F44',
  furShadow: '#6D3B26',
  furDark: '#54301F',
  /** Cold spine light separating the character from whatever is behind it. */
  rim: 'rgba(159,182,212,.55)',
  innerEar: 'rgba(60,26,18,.5)',
  muzzle: '#E9C39A',
  nose: '#3A2117',
  mouth: '#4A1F22',
  saber: '#F3EFE6',
  sclera: '#F6F3EC',
  irisInner: '#F0C46B',
  irisOuter: '#8A5416',
  pupil: '#140C08',
  specularWarm: 'rgba(255,255,255,.95)',
  specularCool: 'rgba(190,215,255,.6)',
} as const;
