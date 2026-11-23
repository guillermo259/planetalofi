export interface DaySkyBlendState {
  dayMix: number;
  skyAlpha: number;
  visible: boolean;
}

/**
 * Computes smooth Day sky visibility & alpha from the damped nightMix (0 = day, 1 = night).
 * Cuts off cleanly before full night so zero daytime haze, clouds, or motes leak into night mode.
 */
export function computeDaySkyBlend(nightMix: number): DaySkyBlendState {
  const clamped = Math.max(0, Math.min(1, nightMix));
  const dayMix = 1 - clamped;
  const edge0 = 0.05;
  const edge1 = 0.78;
  const t = Math.max(0, Math.min(1, (dayMix - edge0) / (edge1 - edge0)));
  const skyAlpha = t * t * (3 - 2 * t);
  return {
    dayMix,
    skyAlpha,
    visible: dayMix > 0.04,
  };
}

/**
 * Deterministic LCG PRNG for reproducible sky clouds and sunlit bokeh distributions.
 */
export function createSeededRandom(seedInitial: number): () => number {
  let seed = seedInitial >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}
