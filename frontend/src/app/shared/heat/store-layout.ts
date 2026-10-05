import { ZoneId } from '../../core/zones';

// Placeholder floor plan of a store, in "plan units". Both the drawing
// (FloorPlan) and the crowd simulation read their geometry from here.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PLAN = { width: 1000, height: 620 } as const;

/** Horizontal walkways: in front of the counters and in front of the tills. */
export const TOP_CORRIDOR = 120;
export const BOTTOM_CORRIDOR = 450;

/** Vertical walkways (x positions) joining both corridors. */
export const LANES = [140, 270, 380, 480, 580, 680, 780, 880] as const;

export const ENTRANCE: Point = { x: 120, y: 606 };
export const EXIT: Point = { x: 860, y: 606 };

/** Served counters along the back wall. */
export const COUNTERS: readonly { zone: ZoneId; rect: Rect }[] = [
  { zone: 'bakery', rect: { x: 40, y: 34, w: 210, h: 56 } },
  { zone: 'butcher', rect: { x: 280, y: 34, w: 190, h: 56 } },
  { zone: 'deli', rect: { x: 490, y: 34, w: 190, h: 56 } },
  { zone: 'fish', rect: { x: 700, y: 34, w: 190, h: 56 } },
];

export const PRODUCE_ISLANDS: readonly Rect[] = [
  { x: 55, y: 160, w: 60, h: 50 },
  { x: 165, y: 160, w: 60, h: 50 },
  { x: 55, y: 240, w: 60, h: 50 },
  { x: 165, y: 240, w: 60, h: 50 },
  { x: 55, y: 320, w: 60, h: 50 },
  { x: 165, y: 320, w: 60, h: 50 },
];

export const SHELVES: readonly Rect[] = [310, 410, 510, 610, 710, 810].map((x) => ({
  x,
  y: 150,
  w: 40,
  h: 270,
}));

export const DAIRY_WALL: Rect = { x: 910, y: 130, w: 56, h: 300 };

export const TILLS: readonly Rect[] = [330, 410, 490, 570, 650, 730].map((x) => ({
  x,
  y: 485,
  w: 44,
  h: 58,
}));

export interface PlanLabel {
  text: string;
  x: number;
  y: number;
  /** Rotated a quarter turn, for the narrow fixture on the side wall. */
  vertical?: boolean;
}

export const LABELS: readonly PlanLabel[] = [
  { text: 'Panadería', x: 145, y: 68 },
  { text: 'Carnicería', x: 375, y: 68 },
  { text: 'Charcutería', x: 585, y: 68 },
  { text: 'Pescadería', x: 795, y: 68 },
  { text: 'Fruta y verdura', x: 140, y: 402 },
  { text: 'Despensa', x: 430, y: 441 },
  { text: 'Bebidas', x: 580, y: 441 },
  { text: 'Droguería y perfumería', x: 735, y: 441 },
  { text: 'Lácteos y congelados', x: 938, y: 280, vertical: true },
  { text: 'Cajas', x: 552, y: 572 },
  { text: 'Entrada', x: 120, y: 588 },
  { text: 'Salida', x: 860, y: 588 },
];
