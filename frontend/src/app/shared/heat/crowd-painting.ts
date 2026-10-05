import { FlowVector } from './flow-field';

// Drawing shared by the simulated map and the real one.

/** One anonymous dot per person. `points` are in canvas pixels. */
export function paintPeople(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  radius: number,
  ratio: number,
): void {
  context.fillStyle = '#13201a';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5 * ratio;
  for (const point of points) {
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
}

/** One arrow per cell: where people mostly go and, by its length, how much. */
export function paintFlow(
  context: CanvasRenderingContext2D,
  vectors: readonly FlowVector[],
  width: number,
  height: number,
  cell: number,
  ratio: number,
  color: string,
): void {
  context.strokeStyle = color;
  context.lineWidth = 2.4 * ratio;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const vector of vectors) {
    const length = cell * (0.4 + 0.75 * Math.sqrt(vector.strength));
    const head = Math.min(cell * 0.3, length * 0.45);
    const tipX = vector.x * width + (vector.dx * length) / 2;
    const tipY = vector.y * height + (vector.dy * length) / 2;
    const angle = Math.atan2(vector.dy, vector.dx);
    context.globalAlpha = 0.35 + 0.65 * vector.strength;
    context.beginPath();
    context.moveTo(tipX - vector.dx * length, tipY - vector.dy * length);
    context.lineTo(tipX, tipY);
    context.moveTo(tipX - head * Math.cos(angle - 0.5), tipY - head * Math.sin(angle - 0.5));
    context.lineTo(tipX, tipY);
    context.lineTo(tipX - head * Math.cos(angle + 0.5), tipY - head * Math.sin(angle + 0.5));
    context.stroke();
  }
  context.globalAlpha = 1;
}

/** A rectangle in fractions of the drawing (0..1), so it holds at any size. */
export interface FloorBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A schematic floor like the one of the simulated store: plain floor with the
 * shelves as solid blocks. Whatever is drawn afterwards (heat, flow, people)
 * shows the aisles between them.
 */
export function paintShelves(
  context: CanvasRenderingContext2D,
  shelves: readonly FloorBlock[],
  width: number,
  height: number,
  colors: { floor: string; shelf: string },
): void {
  context.fillStyle = colors.floor;
  context.fillRect(0, 0, width, height);
  context.fillStyle = colors.shelf;
  // Same corner as the shelves of the simulated plan (6 units in a plan 1000 wide).
  const corner = width * 0.006;
  for (const shelf of shelves) {
    context.beginPath();
    context.roundRect(shelf.x * width, shelf.y * height, shelf.w * width, shelf.h * height, corner);
    context.fill();
  }
}
