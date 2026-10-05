import { seededRandom } from '../../core/random';
import { ZONES, ZoneId, emptyZoneCounts } from '../../core/zones';
import {
  BOTTOM_CORRIDOR,
  ENTRANCE,
  EXIT,
  LANES,
  Point,
  TILLS,
  TOP_CORRIDOR,
} from './store-layout';

// Placeholder for the real tracking data: shoppers walk the floor plan from
// the entrance, stop at a few sections, queue at a till and leave.

const SPAWN_PER_SECOND = 0.4;
const MAX_SHOPPERS = 70;
/** Tills in use; the rest stay closed, so queues build up. */
const OPEN_TILLS = 4;
/** Height of the walkway behind the tills, towards the exit. */
const EXIT_WALKWAY = 562;

/** A position on a walkway: on a lane when `lane` is set, on a corridor otherwise. */
interface Waypoint {
  at: Point;
  lane?: number;
}

/** A place a shopper walks to (`at`) and where they stand once there (`stand`). */
interface Stop extends Waypoint {
  zone: ZoneId;
  stand: Point;
  seconds: number;
}

interface Shopper {
  id: number;
  x: number;
  y: number;
  speed: number;
  confidence: number;
  /** Points still to walk through. */
  path: Point[];
  stops: Stop[];
  /** Index of the stop being walked to or visited. */
  stop: number;
  /** Seconds left standing at the current stop; 0 while walking. */
  waiting: number;
  leaving: boolean;
}

/** One anonymous person, in plan units. Same shape the backend will send. */
export interface CrowdPoint {
  id: number;
  x: number;
  y: number;
  confidence: number;
}

export class CrowdSimulator {
  private readonly random: () => number;
  private readonly shoppers: Shopper[] = [];
  private nextId = 1;
  private spawnDebt = 0;

  /** Seconds people have spent standing in each zone since the start. */
  readonly dwell = emptyZoneCounts();

  constructor(
    seed: string,
    private readonly busyness = 1,
  ) {
    this.random = seededRandom(seed);
  }

  get people(): number {
    return this.shoppers.length;
  }

  tick(seconds: number): void {
    this.spawnDebt += seconds * SPAWN_PER_SECOND * this.busyness;
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      if (this.shoppers.length < MAX_SHOPPERS) {
        this.spawn();
      }
    }
    for (let i = this.shoppers.length - 1; i >= 0; i--) {
      if (this.advance(this.shoppers[i], seconds)) {
        this.shoppers.splice(i, 1);
      }
    }
  }

  /** Advances `total` seconds in fixed steps, e.g. to warm up or to build history. */
  run(total: number, step: number, afterStep?: () => void): void {
    for (let elapsed = 0; elapsed < total; elapsed += step) {
      this.tick(step);
      afterStep?.();
    }
  }

  points(): CrowdPoint[] {
    return this.shoppers.map(({ id, x, y, confidence }) => ({ id, x, y, confidence }));
  }

  /** People currently standing in each zone. */
  occupancy(): Record<ZoneId, number> {
    const counts = emptyZoneCounts();
    for (const shopper of this.shoppers) {
      if (shopper.waiting > 0) {
        counts[shopper.stops[shopper.stop].zone] += 1;
      }
    }
    return counts;
  }

  private spawn(): void {
    const stops = this.shoppingList();
    const door: Waypoint = { at: { x: ENTRANCE.x, y: BOTTOM_CORRIDOR } };
    this.shoppers.push({
      id: this.nextId++,
      x: ENTRANCE.x,
      y: ENTRANCE.y,
      speed: this.between(60, 95),
      confidence: this.between(0.35, 0.95),
      path: [door.at, ...route(door, stops[0]), stops[0].stand],
      stops,
      stop: 0,
      waiting: 0,
      leaving: false,
    });
  }

  /** Moves or waits one shopper. Returns true once they have left the store. */
  private advance(shopper: Shopper, seconds: number): boolean {
    if (shopper.waiting > 0) {
      this.dwell[shopper.stops[shopper.stop].zone] += Math.min(seconds, shopper.waiting);
      shopper.waiting -= seconds;
      if (shopper.waiting <= 0) {
        shopper.waiting = 0;
        this.leaveStop(shopper);
      }
      return false;
    }

    let budget = shopper.speed * seconds;
    while (budget > 0 && shopper.path.length > 0) {
      const target = shopper.path[0];
      const dx = target.x - shopper.x;
      const dy = target.y - shopper.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= budget) {
        shopper.x = target.x;
        shopper.y = target.y;
        shopper.path.shift();
        budget -= distance;
      } else {
        shopper.x += (dx / distance) * budget;
        shopper.y += (dy / distance) * budget;
        budget = 0;
      }
    }

    if (shopper.path.length === 0) {
      if (shopper.leaving) {
        return true;
      }
      shopper.waiting = shopper.stops[shopper.stop].seconds;
    }
    return false;
  }

  private leaveStop(shopper: Shopper): void {
    const current = shopper.stops[shopper.stop];
    const next = shopper.stops[shopper.stop + 1];
    if (!next) {
      // Paid at the till: walk behind the tills to the exit.
      shopper.leaving = true;
      shopper.path = [
        { x: current.stand.x, y: EXIT_WALKWAY },
        { x: EXIT.x, y: EXIT_WALKWAY },
        { ...EXIT },
      ];
      return;
    }
    shopper.stop += 1;
    shopper.path = [current.at, ...route(current, next), next.stand];
  }

  /** A few sections in walking order, always ending at a till. */
  private shoppingList(): Stop[] {
    const sections = ZONES.filter(
      (zone) => zone.id !== 'checkout' && this.random() < 0.25 + 0.45 * zone.popularity,
    );
    if (sections.length === 0) {
      sections.push(ZONES[0]);
    }
    return [...sections.map((zone) => this.stopAt(zone.id)), this.stopAt('checkout')];
  }

  private stopAt(zone: ZoneId): Stop {
    switch (zone) {
      case 'fruit':
        return this.laneStop(zone, 140, this.between(175, 385), this.side(), this.between(3, 8));
      case 'bakery':
        return this.counterStop(zone, this.between(70, 230), this.between(4, 9));
      case 'butcher':
        return this.counterStop(zone, this.between(300, 450), this.between(5, 11));
      case 'deli':
        return this.counterStop(zone, this.between(510, 660), this.between(5, 11));
      case 'fish':
        return this.counterStop(zone, this.between(720, 870), this.between(5, 11));
      case 'dairy':
        return this.laneStop(zone, 880, this.between(150, 410), 16, this.between(3, 7));
      case 'pantry': {
        const lane = this.pick([270, 380, 480]);
        // Lane 270 only has shelves on its right-hand side.
        const side = lane === 270 ? 14 : this.side();
        return this.laneStop(zone, lane, this.between(170, 400), side, this.between(2, 6));
      }
      case 'drinks':
        return this.laneStop(zone, 580, this.between(170, 400), this.side(), this.between(2, 6));
      case 'household':
        return this.laneStop(
          zone,
          this.pick([680, 780]),
          this.between(170, 400),
          this.side(),
          this.between(2, 6),
        );
      case 'checkout': {
        const x = TILLS[Math.floor(this.random() * OPEN_TILLS)].x - 16;
        return {
          zone,
          at: { x, y: BOTTOM_CORRIDOR },
          stand: { x, y: this.between(490, 530) },
          seconds: this.between(7, 15),
        };
      }
    }
  }

  private laneStop(zone: ZoneId, lane: number, y: number, side: number, seconds: number): Stop {
    return { zone, lane, at: { x: lane, y }, stand: { x: lane + side, y }, seconds };
  }

  private counterStop(zone: ZoneId, x: number, seconds: number): Stop {
    return { zone, at: { x, y: TOP_CORRIDOR }, stand: { x, y: 100 }, seconds };
  }

  private between(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)];
  }

  /** Step towards the shelf on the left or on the right of a lane. */
  private side(): number {
    return this.random() < 0.5 ? -14 : 14;
  }
}

/** Walkway points from `from` to `to` (ending at `to.at`), along lanes and corridors. */
export function route(from: Waypoint, to: Waypoint): Point[] {
  if (from.lane !== undefined && from.lane === to.lane) {
    return [to.at];
  }
  let best: Point[] = [to.at];
  let bestLength = Infinity;
  for (const corridor of [TOP_CORRIDOR, BOTTOM_CORRIDOR]) {
    const out = toCorridor(from, corridor);
    const back = toCorridor(to, corridor);
    const leaveAt = out.via.at(-1) ?? from.at;
    const joinAt = back.via.at(-1) ?? to.at;
    const length = out.length + Math.abs(leaveAt.x - joinAt.x) + back.length;
    if (length < bestLength) {
      bestLength = length;
      best = [...out.via, ...[...back.via].reverse(), to.at];
    }
  }
  return best;
}

/** Points to walk from `waypoint` onto the given corridor, and how long that is. */
function toCorridor(waypoint: Waypoint, corridor: number): { via: Point[]; length: number } {
  const { at, lane } = waypoint;
  if (lane !== undefined) {
    return { via: [{ x: lane, y: corridor }], length: Math.abs(at.y - corridor) };
  }
  if (at.y === corridor) {
    return { via: [], length: 0 };
  }
  // On the other corridor: cross through the nearest lane.
  const cross = LANES.reduce((nearest, x) =>
    Math.abs(x - at.x) < Math.abs(nearest - at.x) ? x : nearest,
  );
  return {
    via: [
      { x: cross, y: at.y },
      { x: cross, y: corridor },
    ],
    length: Math.abs(at.x - cross) + Math.abs(at.y - corridor),
  };
}
