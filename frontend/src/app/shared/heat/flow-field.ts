/** Predominant movement in one cell of the scene. */
export interface FlowVector {
  /** Centre of the cell, as fractions (0..1) of the scene. */
  x: number;
  y: number;
  /** Direction, as a unit vector. */
  dx: number;
  dy: number;
  /** Size of the movement relative to the strongest cell (0..1). */
  strength: number;
}

/**
 * Vector field of movement: every step a person takes is added to the cell
 * they are in. Opposite movements cancel out, so what is left in each cell is
 * the predominant direction and how much net traffic it carries.
 */
export class FlowField {
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.vx = new Float32Array(cols * rows);
    this.vy = new Float32Array(cols * rows);
  }

  clear(): void {
    this.vx.fill(0);
    this.vy.fill(0);
  }

  /** Forgets part of the past: every vector is multiplied by `factor` (0..1). */
  fade(factor: number): void {
    for (let i = 0; i < this.vx.length; i++) {
      this.vx[i] *= factor;
      this.vy[i] *= factor;
    }
  }

  /** Adds a step of (`dx`, `dy`) taken at (`x`, `y`), a fraction (0..1) of the scene. */
  add(x: number, y: number, dx: number, dy: number): void {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x * this.cols)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y * this.rows)));
    this.vx[row * this.cols + col] += dx;
    this.vy[row * this.cols + col] += dy;
  }

  /** One vector per cell with enough movement; `minStrength` (0..1) leaves the weak ones out. */
  vectors(minStrength = 0.08): FlowVector[] {
    let strongest = 0;
    for (let i = 0; i < this.vx.length; i++) {
      strongest = Math.max(strongest, Math.hypot(this.vx[i], this.vy[i]));
    }
    if (strongest === 0) {
      return [];
    }
    const vectors: FlowVector[] = [];
    for (let i = 0; i < this.vx.length; i++) {
      const size = Math.hypot(this.vx[i], this.vy[i]);
      if (size / strongest < minStrength) {
        continue;
      }
      vectors.push({
        x: ((i % this.cols) + 0.5) / this.cols,
        y: (Math.floor(i / this.cols) + 0.5) / this.rows,
        dx: this.vx[i] / size,
        dy: this.vy[i] / size,
        strength: size / strongest,
      });
    }
    return vectors;
  }
}
