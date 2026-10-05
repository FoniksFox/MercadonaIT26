import { MotionSampler } from './motion-sampler';

const COLS = 4;
const ROWS = 3;

/** A frame of one gray level, with optional brighter cells. */
function frame(level: number, bright: Record<number, number> = {}): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(COLS * ROWS * 4);
  for (let i = 0; i < COLS * ROWS; i++) {
    pixels.fill(bright[i] ?? level, i * 4, i * 4 + 3);
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

describe('MotionSampler', () => {
  it('should report nothing for the first frame or for a still image', () => {
    const sampler = new MotionSampler(COLS, ROWS);

    expect(sampler.changes(frame(100), 20)).toEqual([]);
    expect(sampler.changes(frame(100), 20)).toEqual([]);
  });

  it('should report the cells that changed more than the threshold', () => {
    const sampler = new MotionSampler(COLS, ROWS);
    sampler.changes(frame(100), 20);

    // Cell 6 (col 2, row 1) changes a lot; cell 0 changes below the threshold.
    const cells = sampler.changes(frame(100, { 6: 196, 0: 110 }), 20);

    expect(cells).toEqual([{ col: 2, row: 1, strength: 1 }]);
  });

  it('should ignore a frame where almost everything changes, like a cut or a loop', () => {
    const sampler = new MotionSampler(COLS, ROWS);
    sampler.changes(frame(20), 20);

    expect(sampler.changes(frame(220), 20)).toEqual([]);
  });

  it('should start over after reset', () => {
    const sampler = new MotionSampler(COLS, ROWS);
    sampler.changes(frame(100), 20);
    sampler.reset();

    expect(sampler.changes(frame(100, { 6: 196 }), 20)).toEqual([]);
  });
});
