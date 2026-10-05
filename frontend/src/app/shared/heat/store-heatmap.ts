import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { ZONES, ZoneId, emptyZoneCounts } from '../../core/zones';
import { CrowdSimulator } from './crowd-simulator';
import { FloorPlan } from './floor-plan';
import { HeatField } from './heat-field';
import { PLAN } from './store-layout';

export type MapPeriod = 'live' | 'today' | 'week' | 'month';

export interface CrowdSnapshot {
  /** People in the store right now; 0 for past periods. */
  people: number;
  /** Live: people standing in each zone. Past periods: share of the time spent there (0..100). */
  byZone: Record<ZoneId, number>;
}

const COLS = 125;
const ROWS = 78;
/** Blob size of one person, in cells. */
const BLOB_RADIUS = 2.75;
/** Share of the heat that is left after one second (live only). */
const LIVE_RETENTION = 0.955;
/** Seconds simulated before showing a live map, so it does not start empty. */
const WARM_UP_SECONDS = 90;
const MIN_HOTTEST = 4;
/** Simulated seconds that stand in for each past period. */
const HISTORY_SECONDS = { today: 400, week: 900, month: 2400 } as const;

/**
 * Heatmap of the store over its floor plan. For now the people come from
 * CrowdSimulator; the backend stream will replace it.
 */
@Component({
  selector: 'app-store-heatmap',
  imports: [FloorPlan],
  host: { class: 'block' },
  template: `
    <div
      class="relative aspect-[1000/620] w-full overflow-hidden rounded-xl border border-line"
      role="img"
      aria-label="Mapa de calor de la tienda"
    >
      <app-floor-plan layer="shapes" class="absolute inset-0" />
      <canvas #canvas class="absolute inset-0 size-full"></canvas>
      <app-floor-plan layer="labels" class="absolute inset-0" />
    </div>
  `,
})
export class StoreHeatmap {
  /** Changes the simulated crowd, e.g. one seed per store. */
  readonly seed = input.required<string>();
  readonly busyness = input(1);
  readonly period = input<MapPeriod>('live');
  readonly snapshot = output<CrowdSnapshot>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly field = new HeatField(COLS, ROWS);
  private simulator = new CrowdSimulator('');
  private live = true;
  private hottest = MIN_HOTTEST;
  private needsPaint = true;
  private frameId = 0;
  private lastFrame = 0;
  private lastSnapshot = 0;

  constructor() {
    effect(() => {
      const seed = this.seed();
      const busyness = this.busyness();
      const period = this.period();
      untracked(() => this.reset(seed, busyness, period));
    });
    afterNextRender(() => {
      this.lastFrame = performance.now();
      this.frameId = requestAnimationFrame(this.frame);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frameId));
  }

  private reset(seed: string, busyness: number, period: MapPeriod): void {
    this.field.clear();
    this.simulator = new CrowdSimulator(`${seed}:${period}`, busyness);
    this.live = period === 'live';
    this.needsPaint = true;
    if (period === 'live') {
      this.simulator.run(WARM_UP_SECONDS, 0.25, () => this.accumulate(0.25));
      this.hottest = Math.max(MIN_HOTTEST, this.field.max());
      this.lastSnapshot = 0;
    } else {
      this.simulator.run(HISTORY_SECONDS[period], 0.5, () => this.deposit(0.5));
      this.hottest = this.field.max();
      this.snapshot.emit({ people: 0, byZone: shares(this.simulator.dwell) });
    }
  }

  /** Live: old heat cools down while the people present add new heat. */
  private accumulate(seconds: number): void {
    this.field.fade(Math.pow(LIVE_RETENTION, seconds));
    this.deposit(seconds);
  }

  private deposit(seconds: number): void {
    for (const point of this.simulator.points()) {
      this.field.add(point.x / PLAN.width, point.y / PLAN.height, BLOB_RADIUS, seconds);
    }
  }

  private readonly frame = (now: number): void => {
    const seconds = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.live) {
      this.simulator.tick(seconds);
      this.accumulate(seconds);
      // Follow the peak up at once and let it come down slowly, so colors do not flicker.
      this.hottest = Math.max(MIN_HOTTEST, this.hottest * 0.999, this.field.max());
      if (now - this.lastSnapshot > 500) {
        this.lastSnapshot = now;
        this.snapshot.emit({ people: this.simulator.people, byZone: this.simulator.occupancy() });
      }
    }
    this.paint();
    this.frameId = requestAnimationFrame(this.frame);
  };

  private paint(): void {
    const canvas = this.canvasRef().nativeElement;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (width === 0 || height === 0) {
      return;
    }
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    if (!this.live && !this.needsPaint && !resized) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    this.needsPaint = false;
    context.clearRect(0, 0, width, height);
    this.field.paint(context, width, height, this.hottest);

    if (this.live) {
      // One anonymous dot per person.
      const scaleX = width / PLAN.width;
      const scaleY = height / PLAN.height;
      context.fillStyle = '#13201a';
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5 * ratio;
      for (const point of this.simulator.points()) {
        context.beginPath();
        context.arc(point.x * scaleX, point.y * scaleY, 3.4 * scaleX, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }
  }
}

/** Turns seconds per zone into whole percentages of the total. */
function shares(dwell: Record<ZoneId, number>): Record<ZoneId, number> {
  const total = Object.values(dwell).reduce((sum, seconds) => sum + seconds, 0);
  const result = emptyZoneCounts();
  for (const zone of ZONES) {
    result[zone.id] = total > 0 ? Math.round((dwell[zone.id] / total) * 100) : 0;
  }
  return result;
}
