import { FloorBlock } from '../shared/heat/crowd-painting';

/**
 * Shelves of the store in front of the camera, in fractions of the frame.
 *
 * Set by hand for the demo footage, seen from above: each of its two rows of
 * seven chairs stands for a run of shelves, split where the row leaves a wider
 * gap. The space above, between and below the rows is the three aisles.
 * Measured on a frame of the footage; move them if the camera moves.
 */
export const REAL_SHELVES: readonly FloorBlock[] = [
  // Top row: chairs 1 to 4, then 5 to 7.
  { x: 0.196, y: 0.266, w: 0.294, h: 0.118 },
  { x: 0.539, y: 0.266, w: 0.219, h: 0.118 },
  // Bottom row: chairs 1 to 4, then 5 to 7.
  { x: 0.169, y: 0.59, w: 0.311, h: 0.142 },
  { x: 0.537, y: 0.59, w: 0.231, h: 0.142 },
];
