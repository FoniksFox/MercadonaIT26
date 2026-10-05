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
import { FlowField } from './flow-field';
import { HeatField } from './heat-field';
import { PLAN, Point, ZONE_AREAS } from './store-layout';

export type MapPeriod = 'live' | 'today' | 'week' | 'month';
/** What is drawn over the floor plan. */
export type MapView = 'heatmap' | 'flow' | 'occupancy';

export interface CrowdSnapshot {
  /** People in the store right now; 0 for past periods. */
  people: number;
  /** Live: people standing in each zone. Past periods: share of the time spent there (0..100). */
  byZone: Record<ZoneId, number>;
  /** How full each zone is against its capacity (0..100); the mean, for past periods. */
  occupancy: Record<ZoneId, number>;
}

const COLS = 125;
const ROWS = 78;
/** Blob size of one person, in cells. */
const BLOB_RADIUS = 2.75;
/** Share of the heat that is left after one second (live only). */
const LIVE_RETENTION = 0.955;
/** The flow keeps a longer memory than the heat, so the arrows stay steady. */
const FLOW_RETENTION = 0.985;
/** Flow cells are about 40 plan units wide, like the grid of the backend's vector field. */
const FLOW_COLS = 25;
const FLOW_ROWS = 16;
/** Seconds simulated before showing a live map, so it does not start empty. */
const WARM_UP_SECONDS = 90;
const MIN_HOTTEST = 4;
/** Simulated seconds that stand in for each past period. */
const HISTORY_SECONDS = { today: 400, week: 900, month: 2400 } as const;

/**
 * The store over its floor plan, as a heatmap, a flow field or occupancy per
 * zone. For now the people come from CrowdSimulator; the backend stream will
 * replace it.
 */
@Component({
  selector: 'app-store-heatmap',
  imports: [FloorPlan],
  host: { class: 'block' },
  template: `
    <div
      class="relative aspect-[1000/620] w-full overflow-hidden rounded-xl border border-line"
      role="img"
      aria-label="Plano de la tienda con los datos de movimiento"
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
  readonly view = input<MapView>('heatmap');
  readonly snapshot = output<CrowdSnapshot>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly field = new HeatField(COLS, ROWS);
  private readonly flow = new FlowField(FLOW_COLS, FLOW_ROWS);
  private simulator = new CrowdSimulator('');
  private lastPositions = new Map<number, Point>();
  /** Mean occupancy of a past period; live occupancy is read from the simulator. */
  private pastOccupancy = emptyZoneCounts();
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
    effect(() => {
      this.view();
      this.needsPaint = true;
    });
    afterNextRender(() => {
      this.lastFrame = performance.now();
      this.frameId = requestAnimationFrame(this.frame);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frameId));
  }

  private reset(seed: string, busyness: number, period: MapPeriod): void {
    this.field.clear();
    this.flow.clear();
    this.lastPositions = new Map();
    this.simulator = new CrowdSimulator(`${seed}:${period}`, busyness);
    this.live = period === 'live';
    this.needsPaint = true;
    if (period === 'live') {
      this.simulator.run(WARM_UP_SECONDS, 0.25, () => this.accumulate(0.25));
      this.hottest = Math.max(MIN_HOTTEST, this.field.max());
      this.lastSnapshot = 0;
    } else {
      const seconds = HISTORY_SECONDS[period];
      this.simulator.run(seconds, 0.5, () => this.deposit(0.5));
      this.hottest = this.field.max();
      this.pastOccupancy = percentages(this.simulator.dwell, (zone) => seconds * zone.capacity);
      const total = Object.values(this.simulator.dwell).reduce((sum, value) => sum + value, 0);
      this.snapshot.emit({
        people: 0,
        byZone: percentages(this.simulator.dwell, () => total),
        occupancy: this.pastOccupancy,
      });
    }
  }

  /** Live: the past fades while the people present add new heat and movement. */
  private accumulate(seconds: number): void {
    this.field.fade(Math.pow(LIVE_RETENTION, seconds));
    this.flow.fade(Math.pow(FLOW_RETENTION, seconds));
    this.deposit(seconds);
  }

  private deposit(seconds: number): void {
    const positions = new Map<number, Point>();
    for (const point of this.simulator.points()) {
      const x = point.x / PLAN.width;
      const y = point.y / PLAN.height;
      this.field.add(x, y, BLOB_RADIUS, seconds);
      const before = this.lastPositions.get(point.id);
      if (before) {
        this.flow.add(x, y, point.x - before.x, point.y - before.y);
      }
      positions.set(point.id, { x: point.x, y: point.y });
    }
    this.lastPositions = positions;
  }

  private occupancy(): Record<ZoneId, number> {
    return this.live
      ? percentages(this.simulator.occupancy(), (zone) => zone.capacity)
      : this.pastOccupancy;
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
        this.snapshot.emit({
          people: this.simulator.people,
          byZone: this.simulator.occupancy(),
          occupancy: this.occupancy(),
        });
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

    // Theme colors, so the drawing follows light and dark mode.
    const style = getComputedStyle(canvas);
    const colors = {
      accent: style.getPropertyValue('--accent').trim(),
      ink: style.getPropertyValue('--ink').trim(),
      floor: style.getPropertyValue('--plan-floor').trim(),
      font: style.fontFamily,
    };

    switch (this.view()) {
      case 'heatmap':
        this.field.paint(context, width, height, this.hottest);
        break;
      case 'flow':
        this.paintFlow(context, width, height, ratio, colors.accent);
        break;
      case 'occupancy':
        this.paintOccupancyTint(context, width, height, colors.accent);
        break;
    }

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

    if (this.view() === 'occupancy') {
      // After the dots, so no figure is hidden behind a person.
      this.paintOccupancyFigures(context, width, height, ratio, colors);
    }
  }

  /** One arrow per cell: where people mostly go and, by its length, how much. */
  private paintFlow(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    ratio: number,
    color: string,
  ): void {
    const cell = width / FLOW_COLS;
    context.strokeStyle = color;
    context.lineWidth = 2.4 * ratio;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const vector of this.flow.vectors()) {
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

  /** Each zone tinted by how full it is. */
  private paintOccupancyTint(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
  ): void {
    const scaleX = width / PLAN.width;
    const scaleY = height / PLAN.height;
    const occupancy = this.occupancy();
    context.fillStyle = color;
    for (const zone of ZONES) {
      const area = ZONE_AREAS[zone.id];
      context.globalAlpha = 0.1 + 0.6 * (occupancy[zone.id] / 100);
      context.beginPath();
      context.roundRect(area.x * scaleX, area.y * scaleY, area.w * scaleX, area.h * scaleY, 8 * scaleX);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  /** The occupancy percentage of each zone, written over it. */
  private paintOccupancyFigures(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    ratio: number,
    colors: { ink: string; floor: string; font: string },
  ): void {
    const scaleX = width / PLAN.width;
    const scaleY = height / PLAN.height;
    const occupancy = this.occupancy();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 ${Math.round(20 * scaleX)}px ${colors.font}`;
    context.lineJoin = 'round';
    context.strokeStyle = colors.floor;
    context.lineWidth = 5 * ratio;
    context.fillStyle = colors.ink;
    for (const zone of ZONES) {
      const area = ZONE_AREAS[zone.id];
      const label = area.label ?? { x: area.x + area.w / 2, y: area.y + area.h / 2 };
      const text = `${occupancy[zone.id]} %`;
      context.strokeText(text, label.x * scaleX, label.y * scaleY);
      context.fillText(text, label.x * scaleX, label.y * scaleY);
    }
  }
}

/** Each zone's value as a whole percentage (0..100) of `whole(zone)`. */
function percentages(
  values: Record<ZoneId, number>,
  whole: (zone: (typeof ZONES)[number]) => number,
): Record<ZoneId, number> {
  const result = emptyZoneCounts();
  for (const zone of ZONES) {
    const total = whole(zone);
    result[zone.id] = total > 0 ? Math.min(100, Math.round((values[zone.id] / total) * 100)) : 0;
  }
  return result;
}
