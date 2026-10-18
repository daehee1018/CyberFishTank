import type { FishTrackingFilter } from './fishTracking';

export const createFishDisplay = () => ({ x: .5, y: .5, rotation: 0, scale: 1, flip: false, turn: 1, turnFlip: false });
export type FishDisplay = ReturnType<typeof createFishDisplay>;

// Keep the tracked center fixed; depth and turn compression have separate wrappers.
export function advanceFishDisplay(shown: FishDisplay, filter: FishTrackingFilter, dt: number, reduced = false) {
  dt = Math.max(0, Math.min(.1, dt));
  const blend = 1 - Math.exp(-dt / .085);
  shown.x += (filter.x - shown.x) * blend;
  shown.y += (filter.y - shown.y) * blend;
  // The depth filter does the smoothing. Only connect its packet-sized steps here.
  shown.scale += (filter.depth.scale - shown.scale) * (1 - Math.exp(-dt / .12));
  if (reduced) { shown.flip = filter.flip; shown.turnFlip = filter.flip; shown.turn = 1; }
  else {
    if (shown.turn >= 1 && shown.flip !== filter.flip) { shown.turn = 0; shown.turnFlip = filter.flip; }
    if (shown.turn < 1) {
      shown.turn = Math.min(1, shown.turn + dt / .24);
      if (shown.turn >= .5) shown.flip = shown.turnFlip;
    }
  }
  // rotation() is relative to the filter's facing. Applying it before the
  // displayed facing switches makes the fish nod in the wrong direction.
  if (shown.flip === filter.flip) {
    const difference = ((filter.rotation() - shown.rotation + 540) % 360) - 180;
    shown.rotation += difference * (1 - Math.exp(-dt / .12));
  }
  return 1 - .22 * Math.sin(shown.turn * Math.PI);
}

export function depthAppearance(scale: number) {
  const far = Math.max(0, Math.min(1, (1 - scale) / .1));
  return `saturate(${1 - far * .18}) contrast(${1 - far * .14}) brightness(${1 - far * .045})`;
}
