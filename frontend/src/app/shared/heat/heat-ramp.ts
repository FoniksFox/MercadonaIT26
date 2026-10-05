// Heat colors: the brand palette from cold to hot (see colors.txt).

const STOPS: readonly [at: number, rgb: readonly [number, number, number]][] = [
  [0, [20, 158, 110]], // green
  [0.3, [191, 209, 72]], // yellow-green
  [0.55, [255, 161, 0]], // orange
  [0.8, [227, 58, 47]], // red
  [1, [151, 0, 74]], // burgundy
];

/** CSS gradient of the ramp, for legends. */
export const HEAT_GRADIENT =
  'linear-gradient(to right, #149e6e, #bfd148 30%, #ffa100 55%, #e33a2f 80%, #97004a)';

/** Color of a heat value in 0..1 as `[r, g, b]`. */
export function heatColor(value: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, value));
  for (let i = 1; i < STOPS.length; i++) {
    const [end, to] = STOPS[i];
    if (t <= end) {
      const [start, from] = STOPS[i - 1];
      const k = (t - start) / (end - start);
      return [
        Math.round(from[0] + (to[0] - from[0]) * k),
        Math.round(from[1] + (to[1] - from[1]) * k),
        Math.round(from[2] + (to[2] - from[2]) * k),
      ];
    }
  }
  return [...STOPS[STOPS.length - 1][1]] as [number, number, number];
}

/**
 * 256-entry RGBA lookup table. Cold values fade to transparent so the floor
 * (or the camera image) stays visible where nobody has been.
 */
export function buildHeatLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const [r, g, b] = heatColor(t);
    const alpha = t < 0.03 ? 0 : Math.min(1, (t - 0.03) / 0.22) * 0.8;
    lut.set([r, g, b, Math.round(alpha * 255)], i * 4);
  }
  return lut;
}
