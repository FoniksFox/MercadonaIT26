import { FloorBlock } from '../shared/heat/crowd-painting';

/**
 * Shelves of the store in front of the camera, in fractions of the frame.
 *
 * Set by hand for the demo, whose camera looks down on two rows of seven
 * chairs: each row stands for a run of shelves, split where it leaves a wider
 * gap. The space above, between and below the rows is the three aisles.
 * Measured on the live camera (a 640 × 360 frame); measure again if it moves.
 */
export const REAL_SHELVES: readonly FloorBlock[] = [
  // Top row: chairs 1 to 4, then 5 to 7.
  { x: 0.222, y: 0.35, w: 0.269, h: 0.103 },
  { x: 0.531, y: 0.35, w: 0.201, h: 0.103 },
  // Bottom row: chairs 1 to 4, then 5 to 7.
  { x: 0.192, y: 0.591, w: 0.288, h: 0.129 },
  { x: 0.526, y: 0.591, w: 0.215, h: 0.129 },
];
