import { buildHeatLut } from './heat-ramp';

/**
 * A grid of accumulated "presence". Positions are fractions (0..1) of the
 * scene, so the same field works for the floor plan and for a video frame.
 */
export class HeatField {
  private readonly cells: Float32Array;
  private readonly lut = buildHeatLut();
  private buffer?: HTMLCanvasElement;
  private image?: ImageData;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.cells = new Float32Array(cols * rows);
  }

  clear(): void {
    this.cells.fill(0);
  }

  /** Cools the whole field: every cell is multiplied by `factor` (0..1). */
  fade(factor: number): void {
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) {
      cells[i] *= factor;
    }
  }

  /** Adds a soft round blob of heat centred on (`x`, `y`). `radius` is in cells. */
  add(x: number, y: number, radius: number, amount: number): void {
    const cx = x * this.cols;
    const cy = y * this.rows;
    const reach = Math.max(1, Math.ceil(radius));
    const sigma = Math.max(0.5, radius / 2);
    const minCol = Math.max(0, Math.floor(cx - reach));
    const maxCol = Math.min(this.cols - 1, Math.ceil(cx + reach));
    const minRow = Math.max(0, Math.floor(cy - reach));
    const maxRow = Math.min(this.rows - 1, Math.ceil(cy + reach));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const dx = col + 0.5 - cx;
        const dy = row + 0.5 - cy;
        const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        this.cells[row * this.cols + col] += amount * weight;
      }
    }
  }

  valueAt(col: number, row: number): number {
    return this.cells[row * this.cols + col];
  }

  max(): number {
    let max = 0;
    for (const value of this.cells) {
      if (value > max) {
        max = value;
      }
    }
    return max;
  }

  /**
   * Paints the field over the whole `width` x `height` area of `context`.
   * `hottest` is the cell value drawn with the hottest color.
   */
  paint(context: CanvasRenderingContext2D, width: number, height: number, hottest: number): void {
    if (!this.buffer) {
      this.buffer = context.canvas.ownerDocument.createElement('canvas');
      this.buffer.width = this.cols;
      this.buffer.height = this.rows;
    }
    const bufferContext = this.buffer.getContext('2d');
    if (!bufferContext) {
      return;
    }
    this.image ??= bufferContext.createImageData(this.cols, this.rows);
    const pixels = this.image.data;
    for (let i = 0; i < this.cells.length; i++) {
      // Square root: brief passes (walking) stay visible next to long stays (queues).
      const heat = hottest > 0 ? Math.sqrt(this.cells[i] / hottest) : 0;
      const level = Math.min(255, Math.round(heat * 255)) * 4;
      pixels[i * 4] = this.lut[level];
      pixels[i * 4 + 1] = this.lut[level + 1];
      pixels[i * 4 + 2] = this.lut[level + 2];
      pixels[i * 4 + 3] = this.lut[level + 3];
    }
    bufferContext.putImageData(this.image, 0, 0);
    // Scaling the small buffer up with smoothing is what makes the blobs soft.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(this.buffer, 0, 0, width, height);
  }
}
