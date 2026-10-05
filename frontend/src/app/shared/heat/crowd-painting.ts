import { FlowVector } from './flow-field';
import { HeatField } from './heat-field';

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

/**
 * A schematic floor inferred from movement: a corridor wherever `field` holds
 * at least `walked` seconds of presence, and a solid block (shelves, counters,
 * anything nobody walks through) everywhere else.
 *
 * The corridor outline is the contour of the field at that level (marching
 * squares), so it comes out smooth instead of following the grid cells.
 */
export function paintWalkedFloor(
  context: CanvasRenderingContext2D,
  field: HeatField,
  width: number,
  height: number,
  walked: number,
  colors: { corridor: string; block: string; outline: string },
  ratio: number,
): void {
  context.fillStyle = colors.block;
  context.fillRect(0, 0, width, height);

  const cellWidth = width / field.cols;
  const cellHeight = height / field.rows;
  // Samples sit at cell centres; outside the grid the nearest cell is repeated,
  // so a corridor that reaches the edge of the frame is drawn up to the edge.
  const sample = (col: number, row: number) =>
    field.valueAt(
      Math.min(field.cols - 1, Math.max(0, col)),
      Math.min(field.rows - 1, Math.max(0, row)),
    );

  const floor = new Path2D();
  const outline = new Path2D();
  for (let row = -1; row < field.rows; row++) {
    for (let col = -1; col < field.cols; col++) {
      // Corners of this square, clockwise from the top left.
      const corners = [
        { x: col, y: row },
        { x: col + 1, y: row },
        { x: col + 1, y: row + 1 },
        { x: col, y: row + 1 },
      ].map((corner) => ({ ...corner, value: sample(corner.x, corner.y) }));
      if (corners.every((corner) => corner.value < walked)) {
        continue;
      }

      // Walk the square: keep the corners inside the corridor and the points
      // where the contour crosses an edge.
      const polygon: { x: number; y: number; crossing: boolean }[] = [];
      for (let i = 0; i < 4; i++) {
        const from = corners[i];
        const to = corners[(i + 1) % 4];
        if (from.value >= walked) {
          polygon.push({ x: from.x, y: from.y, crossing: false });
        }
        if (from.value >= walked !== to.value >= walked) {
          const t = (walked - from.value) / (to.value - from.value);
          polygon.push({
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
            crossing: true,
          });
        }
      }

      const px = (point: { x: number }) => (point.x + 0.5) * cellWidth;
      const py = (point: { y: number }) => (point.y + 0.5) * cellHeight;
      polygon.forEach((point, i) =>
        i === 0 ? floor.moveTo(px(point), py(point)) : floor.lineTo(px(point), py(point)),
      );
      floor.closePath();
      // The contour itself: the sides of the polygon that join two crossings.
      polygon.forEach((point, i) => {
        const next = polygon[(i + 1) % polygon.length];
        if (point.crossing && next.crossing) {
          outline.moveTo(px(point), py(point));
          outline.lineTo(px(next), py(next));
        }
      });
    }
  }

  context.fillStyle = colors.corridor;
  context.fill(floor);
  context.strokeStyle = colors.outline;
  context.lineWidth = 1.5 * ratio;
  context.lineCap = 'round';
  context.stroke(outline);
}
