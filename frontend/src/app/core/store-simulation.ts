import { DestroyRef, Service, effect, inject, signal, untracked } from '@angular/core';
import { CrowdPoint, CrowdSimulator } from '../shared/heat/crowd-simulator';
import { FlowField } from '../shared/heat/flow-field';
import { HeatField } from '../shared/heat/heat-field';
import { PLAN, Point } from '../shared/heat/store-layout';
import { LiveSnapshot, LiveStaffing } from './live-staffing';
import { Supermarket, Supermarkets } from './supermarkets';
import { ZoneId, emptyZoneCounts, zonePercentages } from './zones';

export interface CrowdSnapshot {
  /** People in the store right now; 0 for past periods. */
  people: number;
  /** Live: people standing in each zone. Past periods: share of the time spent there (0..100). */
  byZone: Record<ZoneId, number>;
  /** How full each zone is against its capacity (0..100); the mean, for past periods. */
  occupancy: Record<ZoneId, number>;
}

/** Heat grid over the floor plan. */
export const HEAT_COLS = 125;
export const HEAT_ROWS = 78;
/** Blob size of one person, in heat cells. */
export const BLOB_RADIUS = 3.75;
/** Flow cells are about 40 plan units wide, like the grid of the backend's vector field. */
export const FLOW_COLS = 25;
export const FLOW_ROWS = 16;
/**
 * Seconds of presence painted with the hottest color until some spot has
 * more, so the first steps of a simulation do not look like a crowd.
 */
export const MIN_HOTTEST = 2.5;
/** Share of the recent heat left after one second: a trail is gone in about a quarter of a minute. */
const RECENT_RETENTION = 0.6;

const STEP_MS = 33;
const SNAPSHOT_MS = 500;
/** Longest real time one step may stand for, e.g. after the tab was in the background. */
const MAX_STEP_SECONDS = 0.1;

/**
 * The one live simulation of the selected store. It belongs to the app, not
 * to a screen: it keeps running while the user moves between pages, and both
 * the map and the management view read from it, so they always agree.
 *
 * It starts over only with `restart()` or when another store is selected.
 * The backend's live data will take its place.
 */
@Service()
export class StoreSimulation {
  private readonly supermarket = inject(Supermarkets).current;

  /** Simulated seconds per real second. */
  readonly speed = signal(1);
  /** People and zones right now; refreshed twice a second. */
  readonly snapshot = signal<CrowdSnapshot>(emptySnapshot());
  /** Staff against customers right now; refreshed every simulated second. */
  readonly staffing = signal<LiveSnapshot>(new LiveStaffing().snapshot(0));

  // Read directly by whoever paints the map, every frame.
  /** Heat of the last moments: it fades, so it follows people around. */
  readonly recent = new HeatField(HEAT_COLS, HEAT_ROWS);
  /** Heat since the simulation started: it only grows. */
  readonly total = new HeatField(HEAT_COLS, HEAT_ROWS);
  readonly flow = new FlowField(FLOW_COLS, FLOW_ROWS);
  /** Values painted with the hottest color in each heat field. */
  hottestRecent = MIN_HOTTEST;
  hottestTotal = MIN_HOTTEST;

  private simulator = new CrowdSimulator('');
  private watch = new LiveStaffing();
  private lastPositions = new Map<number, Point>();
  private lastStep = performance.now();
  private lastSnapshot = 0;
  /** Simulated time not yet turned into a whole-second staffing reading. */
  private pendingSeconds = 0;

  constructor() {
    effect(() => {
      const store = this.supermarket();
      untracked(() => this.begin(store));
    });
    const timer = setInterval(() => this.step(), STEP_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Starts over with an empty store. Nothing else restarts the simulation. */
  restart(): void {
    this.begin(this.supermarket());
  }

  /** Everyone in the store right now, in plan units. */
  points(): CrowdPoint[] {
    return this.simulator.points();
  }

  private begin(store: Supermarket): void {
    this.simulator = new CrowdSimulator(`${store.id}:live`, store.busyness);
    this.watch = new LiveStaffing();
    this.recent.clear();
    this.total.clear();
    this.flow.clear();
    this.hottestRecent = MIN_HOTTEST;
    this.hottestTotal = MIN_HOTTEST;
    this.lastPositions = new Map();
    this.pendingSeconds = 0;
    this.lastStep = performance.now();
    this.lastSnapshot = this.lastStep;
    this.snapshot.set(emptySnapshot());
    this.staffing.set(this.watch.snapshot(0));
  }

  private step(): void {
    const now = performance.now();
    const seconds = Math.min(MAX_STEP_SECONDS, (now - this.lastStep) / 1000) * this.speed();
    this.lastStep = now;

    this.simulator.tick(seconds);
    this.recent.fade(Math.pow(RECENT_RETENTION, seconds));
    const positions = new Map<number, Point>();
    for (const point of this.simulator.points()) {
      const x = point.x / PLAN.width;
      const y = point.y / PLAN.height;
      this.recent.add(x, y, BLOB_RADIUS, seconds);
      this.total.add(x, y, BLOB_RADIUS, seconds);
      const before = this.lastPositions.get(point.id);
      if (before) {
        this.flow.add(x, y, point.x - before.x, point.y - before.y);
      }
      positions.set(point.id, { x: point.x, y: point.y });
    }
    this.lastPositions = positions;
    // The recent peak is followed up at once and released slowly, so colors do not flicker.
    this.hottestRecent = Math.max(MIN_HOTTEST, this.hottestRecent * 0.998, this.recent.max());
    this.hottestTotal = Math.max(MIN_HOTTEST, this.total.max());

    this.pendingSeconds += seconds;
    let watched = false;
    while (this.pendingSeconds >= 1) {
      this.pendingSeconds -= 1;
      this.watch.observe(this.simulator.occupancy(), new Date());
      watched = true;
    }
    if (watched) {
      this.staffing.set(this.watch.snapshot(this.simulator.people));
    }

    if (now - this.lastSnapshot > SNAPSHOT_MS) {
      this.lastSnapshot = now;
      const standing = this.simulator.occupancy();
      this.snapshot.set({
        people: this.simulator.people,
        byZone: standing,
        occupancy: zonePercentages(standing, (zone) => zone.capacity),
      });
    }
  }
}

function emptySnapshot(): CrowdSnapshot {
  return { people: 0, byZone: emptyZoneCounts(), occupancy: emptyZoneCounts() };
}
