export interface MotionCell {
  col: number;
  row: number;
  /** How much the cell changed, 0..1. */
  strength: number;
}

/** Brightness change (0..255) that counts as full-strength motion. */
const FULL_STRENGTH = 96;
/** Above this share of changed cells the frame is a cut (loop, seek), not motion. */
const CUT_SHARE = 0.6;

/**
 * Finds where a video is moving by comparing each frame with the previous one.
 * Local stand-in for the model's detections: it sees movement, not people.
 */
export class MotionSampler {
  private previous: Uint8Array | null = null;

  constructor(
    private readonly cols: number,
    private readonly rows: number,
  ) {}

  reset(): void {
    this.previous = null;
  }

  /**
   * `rgba` holds `cols` x `rows` pixels. Returns the cells whose brightness
   * changed by more than `threshold` (0..255) since the previous call.
   */
  changes(rgba: Uint8ClampedArray, threshold: number): MotionCell[] {
    const count = this.cols * this.rows;
    const gray = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      gray[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
    }
    const previous = this.previous;
    this.previous = gray;
    if (!previous) {
      return [];
    }

    const cells: MotionCell[] = [];
    for (let i = 0; i < count; i++) {
      const difference = Math.abs(gray[i] - previous[i]);
      if (difference > threshold) {
        cells.push({
          col: i % this.cols,
          row: Math.floor(i / this.cols),
          strength: Math.min(1, difference / FULL_STRENGTH),
        });
      }
    }
    return cells.length > count * CUT_SHARE ? [] : cells;
  }
}
