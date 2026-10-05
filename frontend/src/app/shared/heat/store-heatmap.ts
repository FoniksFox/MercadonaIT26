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
import {
  BLOB_RADIUS,
  CrowdSnapshot,
  FLOW_COLS,
  FLOW_ROWS,
  HEAT_COLS,
  HEAT_ROWS,
  StoreSimulation,
} from '../../core/store-simulation';
import { ZONES, ZoneId, emptyZoneCounts, zonePercentages } from '../../core/zones';
import { paintFlow, paintPeople } from './crowd-painting';
import { CrowdSimulator } from './crowd-simulator';
import { FloorPlan } from './floor-plan';
import { FlowField } from './flow-field';
import { HeatField } from './heat-field';
import { PLAN, Point, ZONE_AREAS } from './store-layout';

export type { CrowdSnapshot } from '../../core/store-simulation';

export type MapPeriod = 'live' | 'today' | 'week' | 'month';
/** What is drawn over the floor plan. */
export type MapView = 'heatmap' | 'accumulated' | 'flow' | 'occupancy';

/** Simulated seconds that stand in for each past period. */
const HISTORY_SECONDS = { today: 400, week: 900, month: 2400 } as const;

/**
 * The store over its floor plan, as heat, flow or occupancy per zone.
 *
 * Live, it only paints the app-wide StoreSimulation: it never starts or
 * restarts it, so leaving this screen and coming back shows the same store.
 * A past period is built here, already accumulated.
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
  /** Changes the crowd of the past periods, e.g. one seed per store. */
  readonly seed = input.required<string>();
  readonly busyness = input(1);
  readonly period = input<MapPeriod>('live');
  readonly view = input<MapView>('heatmap');
  readonly accumulated = input(false);
  /** Change its value to start the live simulation again from an empty store. */
  readonly restart = input(0);
  /** Simulated seconds per real second while live, e.g. 2 to go twice as fast. */
  readonly speed = input(1);
  readonly snapshot = output<CrowdSnapshot>();

  private readonly simulation = inject(StoreSimulation);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  // What a past period accumulated.
  private readonly pastHeat = new HeatField(HEAT_COLS, HEAT_ROWS);
  private readonly pastFlow = new FlowField(FLOW_COLS, FLOW_ROWS);
  private pastHottest = 0;
  private pastOccupancy = emptyZoneCounts();

  private needsPaint = true;
  private frameId = 0;

  constructor() {
    effect(() => {
      const seed = this.seed();
      const busyness = this.busyness();
      const period = this.period();
      untracked(() => {
        this.needsPaint = true;
        if (period !== 'live') {
          this.buildPast(seed, busyness, period);
        }
      });
    });
    effect(() => {
      this.view();
      this.needsPaint = true;
    });
    afterNextRender(() => {
      this.frameId = requestAnimationFrame(this.frame);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frameId));
  }

  /** Runs a whole past period at once and keeps what it accumulated. */
  private buildPast(seed: string, busyness: number, period: Exclude<MapPeriod, 'live'>): void {
    const simulator = new CrowdSimulator(`${seed}:${period}`, busyness);
    const seconds = HISTORY_SECONDS[period];
    const step = 0.5;
    this.pastHeat.clear();
    this.pastFlow.clear();
    let lastPositions = new Map<number, Point>();
    simulator.run(seconds, step, () => {
      const positions = new Map<number, Point>();
      for (const point of simulator.points()) {
        const x = point.x / PLAN.width;
        const y = point.y / PLAN.height;
        this.pastHeat.add(x, y, BLOB_RADIUS, step);
        const before = lastPositions.get(point.id);
        if (before) {
          this.pastFlow.add(x, y, point.x - before.x, point.y - before.y);
        }
        positions.set(point.id, { x: point.x, y: point.y });
      }
      lastPositions = positions;
    });
    this.pastHottest = this.pastHeat.max();
    this.pastOccupancy = zonePercentages(simulator.dwell, (zone) => seconds * zone.capacity);
    const total = Object.values(simulator.dwell).reduce((sum, value) => sum + value, 0);
    this.snapshot.emit({
      people: 0,
      byZone: zonePercentages(simulator.dwell, () => total),
      occupancy: this.pastOccupancy,
    });
  }

  private occupancy(live: boolean): Record<ZoneId, number> {
    return live ? this.simulation.snapshot().occupancy : this.pastOccupancy;
  }

  private readonly frame = (): void => {
    this.paint();
    this.frameId = requestAnimationFrame(this.frame);
  };

  private paint(): void {
    const live = this.period() === 'live';
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
    // A past period does not change: paint it once, and again only if something does.
    if (!live && !this.needsPaint && !resized) {
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
    const simulation = this.simulation;

    switch (this.view()) {
      case 'heatmap':
        // A past period has no "recent": it shows what the whole period accumulated.
        if (this.live) {
          if (this.accumulated()) {
            this.total.paint(context, width, height, this.hottestTotal);
          }
          this.recent.paint(context, width, height, this.hottestRecent);
        } else {
          this.pastHeat.paint(context, width, height, this.pastHottest);
        }
        break;
      case 'flow':
        paintFlow(
          context,
          (live ? simulation.flow : this.pastFlow).vectors(),
          width,
          height,
          width / FLOW_COLS,
          ratio,
          colors.accent,
        );
        break;
      case 'occupancy':
        this.paintOccupancyTint(context, width, height, colors.accent, live);
        break;
    }

    if (live) {
      const scaleX = width / PLAN.width;
      const scaleY = height / PLAN.height;
      const people = simulation.points().map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
      paintPeople(context, people, 3.4 * scaleX, ratio);
    }

    if (this.view() === 'occupancy') {
      // After the dots, so no figure is hidden behind a person.
      this.paintOccupancyFigures(context, width, height, ratio, colors, live);
    }
  }

  /** Each zone tinted by how full it is. */
  private paintOccupancyTint(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
    live: boolean,
  ): void {
    const scaleX = width / PLAN.width;
    const scaleY = height / PLAN.height;
    const occupancy = this.occupancy(live);
    context.fillStyle = color;
    for (const zone of ZONES) {
      const area = ZONE_AREAS[zone.id];
      context.globalAlpha = 0.1 + 0.6 * (occupancy[zone.id] / 100);
      context.beginPath();
      context.roundRect(
        area.x * scaleX,
        area.y * scaleY,
        area.w * scaleX,
        area.h * scaleY,
        8 * scaleX,
      );
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
    live: boolean,
  ): void {
    const scaleX = width / PLAN.width;
    const scaleY = height / PLAN.height;
    const occupancy = this.occupancy(live);
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
