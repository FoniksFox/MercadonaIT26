import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { BackendConnection, ChannelStatus } from '../core/backend-connection';
import { BackendFrame, jpegSource } from '../core/backend-protocol';
import { formatNumber } from '../core/format';
import { ZoneId, ZONES, zonePercentages } from '../core/zones';
import { paintFlow, paintPeople, paintShelves } from '../shared/heat/crowd-painting';
import { FlowField } from '../shared/heat/flow-field';
import { HeatField } from '../shared/heat/heat-field';
import { HEAT_GRADIENT } from '../shared/heat/heat-ramp';
import { Icon } from '../shared/icon';
import { IconName } from '../shared/icons';
import { PageHeader } from '../shared/page-header';
import { PLAN, ZONE_AREAS } from '../shared/heat/store-layout';
import { REAL_SHELVES } from './real-layout';

type RealView = 'heatmap' | 'flow' | 'occupancy';

interface FrameSize {
  width: number;
  height: number;
  /** False while it is only assumed, before the first image has told the real size. */
  known: boolean;
}

/** Heat grid: this many cells across, as many down as the frame shape asks for. */
const COLS = 96;
/** Size of a flow cell in frame pixels; the backend's own vector field uses 45. */
const FLOW_CELL = 45;
/** Blob of one person, in heat cells (about 20 px of a 640 px frame). */
const BLOB_RADIUS = 3;
/** Seconds of presence painted with the hottest color until some spot has more. */
const MIN_HOTTEST = 1.5;
/** Share of the recent heat left after one second: a trail is gone in about a quarter of a minute. */
const RECENT_RETENTION = 0.6;
/** Longest gap between two messages that still counts as continuous presence. */
const MAX_GAP_SECONDS = 0.25;

const STATUS_DOT = {
  ok: 'bg-brand-green',
  waiting: 'bg-brand-orange',
  off: 'bg-ink-3',
} as const;

/**
 * What the vision backend sends, painted by the frontend: every person as a
 * dot, and the heat and the flow they build up as they move. Also shows the
 * raw material (images, stats, last message) to check that it all arrives.
 */
@Component({
  selector: 'app-real-map',
  imports: [Icon, PageHeader],
  providers: [BackendConnection],
  templateUrl: './real.html',
  styleUrl: './simulation.css',
})
export class RealMap {
  protected readonly backend = inject(BackendConnection);

  protected readonly view = signal<RealView>('heatmap');
  protected readonly accumulated = signal(false);
  protected readonly showCamera = signal(true);
  protected readonly frameSize = signal<FrameSize>({ width: 640, height: 360, known: false });
  protected readonly clearing = signal(false);

  protected readonly heatGradient = HEAT_GRADIENT;
  protected readonly views: readonly { id: RealView; label: string; icon: IconName }[] = [
    { id: 'heatmap', label: 'Mapa de calor', icon: 'flame' },
    { id: 'flow', label: 'Mapa de flujo', icon: 'wind' },
    { id: 'occupancy', label: 'Ocupación', icon: 'layout' },
  ];

  protected readonly viewLabel = computed(
    () => this.views.find((option) => option.id === this.view())!.label,
  );

  protected toggleAccumulated(): void {
    this.accumulated.update((enabled) => !enabled);
  }

  protected selectView(view: RealView): void {
    if (view !== 'heatmap') {
      this.accumulated.set(false);
    }
    this.view.set(view);
  }
  protected readonly aspect = computed(
    () => `${this.frameSize().width} / ${this.frameSize().height}`,
  );
  protected readonly stats = computed(() => this.backend.frame()?.stats ?? null);
  protected readonly cameraSource = computed(() => source(this.backend.images()?.raw));

  /** The four images the backend renders, as it sends them. */
  protected readonly renders = computed(() => {
    const images = this.backend.images();
    return [
      { label: 'Cámara', source: source(images?.raw) },
      { label: 'Calor reciente', source: source(images?.heat) },
      { label: 'Calor acumulado', source: source(images?.persistentHeat) },
      { label: 'Flujo', source: source(images?.flow) },
    ];
  });

  protected readonly figures = computed(() => {
    const stats = this.stats();
    const received = this.backend.received();
    return [
      { label: 'Velocidad del modelo', value: stats ? `${stats.fps} fps` : '–' },
      { label: 'Latencia', value: stats ? `${stats.latency} ms` : '–' },
      { label: 'Hardware', value: stats?.device ? stats.device.toUpperCase() : '–' },
      { label: 'Mensajes de datos', value: formatNumber(received.data) },
      { label: 'Mensajes de imágenes', value: formatNumber(received.images) },
      { label: 'Mensajes no válidos', value: formatNumber(received.invalid) },
    ];
  });

  protected readonly channels = computed(() => {
    const perSecond = this.backend.dataPerSecond();
    return [
      {
        name: 'Datos',
        ...this.describe(
          this.backend.dataStatus(),
          perSecond > 0 ? `Llegan ${perSecond} mensajes por segundo` : 'Llegan datos',
        ),
      },
      { name: 'Imágenes', ...this.describe(this.backend.imageStatus(), 'Llegan imágenes') },
      { name: 'Configuración (HTTP)', ...this.httpState() },
    ];
  });

  /** The last data message, indented to be read. */
  protected readonly sample = computed(() => {
    const text = this.backend.sample();
    try {
      return text ? JSON.stringify(JSON.parse(text), null, 2) : '';
    } catch {
      return text;
    }
  });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  /** Heat of the last moments: it fades, so it follows people around. */
  private recent = new HeatField(COLS, 54);
  /** Heat since the map was last restarted: it only grows. */
  private total = new HeatField(COLS, 54);
  private flow = new FlowField(14, 8);
  private lastPositions = new Map<number, { x: number; y: number }>();
  private lastMessage = 0;
  private lastPaint = 0;
  private hottestRecent = MIN_HOTTEST;
  private hottestTotal = MIN_HOTTEST;
  private frameId = 0;

  constructor() {
    this.backend.onFrame = (frame) => this.accumulate(frame);
    this.backend.connectIfRemembered();
    afterNextRender(() => {
      this.frameId = requestAnimationFrame(this.paint);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frameId));
  }

  protected connect(event: Event, address: string): void {
    event.preventDefault();
    this.backend.connect(address);
  }

  /** Empties the heat and the flow painted here; the backend keeps its own. */
  protected restart(): void {
    this.recent.clear();
    this.total.clear();
    this.flow.clear();
    this.lastPositions = new Map();
    this.hottestRecent = MIN_HOTTEST;
    this.hottestTotal = MIN_HOTTEST;
  }

  /** Asks the backend to empty its maps, and empties the ones painted here too. */
  protected async clearBackend(): Promise<void> {
    this.clearing.set(true);
    if (await this.backend.clearMaps()) {
      this.restart();
    }
    this.clearing.set(false);
  }

  /** A camera image also tells the size of the frame, for a backend that does not send it. */
  protected measure(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.adoptSize(image.naturalWidth, image.naturalHeight);
  }

  /** Sets the size of the frame the points refer to, once it is known or when it changes. */
  private adoptSize(frameWidth: number, frameHeight: number): void {
    const image = { naturalWidth: frameWidth, naturalHeight: frameHeight };
    const { width, height, known } = this.frameSize();
    if (
      image.naturalWidth === 0 ||
      (known && image.naturalWidth === width && image.naturalHeight === height)
    ) {
      return;
    }
    this.frameSize.set({ width: image.naturalWidth, height: image.naturalHeight, known: true });
    // Same shape as the frame, so blobs are round. What was painted so far is dropped.
    const rows = Math.max(8, Math.round((COLS * image.naturalHeight) / image.naturalWidth));
    this.recent = new HeatField(COLS, rows);
    this.total = new HeatField(COLS, rows);
    this.flow = new FlowField(
      Math.max(4, Math.round(image.naturalWidth / FLOW_CELL)),
      Math.max(3, Math.round(image.naturalHeight / FLOW_CELL)),
    );
    this.restart();
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** Adds one frame of the backend to the heat and the flow painted here. */
  private accumulate(frame: BackendFrame): void {
    if (frame.size) {
      this.adoptSize(frame.size.width, frame.size.height);
    }
    const now = performance.now();
    const seconds = Math.min(MAX_GAP_SECONDS, (now - this.lastMessage) / 1000);
    this.lastMessage = now;
    const { width, height } = this.frameSize();
    const positions = new Map<number, { x: number; y: number }>();
    for (const point of frame.points) {
      const x = point.x / width;
      const y = point.y / height;
      this.recent.add(x, y, BLOB_RADIUS, seconds);
      this.total.add(x, y, BLOB_RADIUS, seconds);
      const before = this.lastPositions.get(point.id);
      if (before) {
        this.flow.add(x, y, point.x - before.x, point.y - before.y);
      }
      positions.set(point.id, { x: point.x, y: point.y });
    }
    this.lastPositions = positions;
    this.hottestTotal = Math.max(MIN_HOTTEST, this.total.max());
  }

  private readonly paint = (now: number): void => {
    this.frameId = requestAnimationFrame(this.paint);
    // The recent heat cools with real time, also while no messages arrive.
    this.recent.fade(Math.pow(RECENT_RETENTION, Math.min(1, (now - this.lastPaint) / 1000)));
    this.lastPaint = now;
    this.hottestRecent = Math.max(MIN_HOTTEST, this.hottestRecent * 0.998, this.recent.max());

    const canvas = this.canvasRef().nativeElement;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (width === 0 || height === 0) {
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, width, height);

    const style = getComputedStyle(canvas);
    const accent = style.getPropertyValue('--accent').trim();
    const frame = this.backend.frame();
    if (!this.showCamera()) {
      // Without the camera, a plan like the simulated one: the shelves, fixed, on plain floor.
      paintShelves(context, REAL_SHELVES, width, height, {
        floor: style.getPropertyValue('--plan-floor').trim(),
        shelf: style.getPropertyValue('--plan-fixture').trim(),
      });
    }
    switch (this.view()) {
      case 'heatmap':
        if (this.accumulated()) {
          this.total.paint(context, width, height, this.hottestTotal);
        }
        this.recent.paint(context, width, height, this.hottestRecent);
        break;
      case 'flow':
        paintFlow(
          context,
          this.flow.vectors(),
          width,
          height,
          width / this.flow.cols,
          ratio,
          accent,
        );
        break;
      case 'occupancy':
        if (frame) {
          this.paintOccupancy(context, frame, width, height, ratio, accent, style.fontFamily);
        }
        break;
    }

    if (!frame) {
      return;
    }
    const size = this.frameSize();
    const scaleX = width / size.width;
    const scaleY = height / size.height;

    // The backend's busiest spots, numbered by rank.
    context.font = `700 ${Math.round(13 * ratio)}px ${style.fontFamily}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const spot of frame.stats.hotspots) {
      const x = spot.x * scaleX;
      const y = spot.y * scaleY;
      context.beginPath();
      context.arc(x, y, 13 * ratio, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.lineWidth = 2.5 * ratio;
      context.strokeStyle = accent;
      context.stroke();
      context.fillStyle = '#13201a';
      context.fillText(String(spot.rank), x, y);
    }

    paintPeople(
      context,
      frame.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
      5 * ratio,
      ratio,
    );
  };

  private paintOccupancy(
    context: CanvasRenderingContext2D,
    frame: BackendFrame,
    width: number,
    height: number,
    ratio: number,
    color: string,
    fontFamily: string,
  ): void {
    const occupancy = this.occupancy(frame);
    const scaleX = width / PLAN.width;
    const scaleY = height / PLAN.height;

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

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 ${Math.round(20 * scaleX)}px ${fontFamily}`;
    context.lineJoin = 'round';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 5 * ratio;
    context.fillStyle = '#13201a';
    for (const zone of ZONES) {
      const area = ZONE_AREAS[zone.id];
      const label = area.label ?? { x: area.x + area.w / 2, y: area.y + area.h / 2 };
      const text = `${occupancy[zone.id]} %`;
      context.strokeText(text, label.x * scaleX, label.y * scaleY);
      context.fillText(text, label.x * scaleX, label.y * scaleY);
    }
  }

  private occupancy(frame: BackendFrame): Record<ZoneId, number> {
    const standing = Object.fromEntries(ZONES.map((zone) => [zone.id, 0])) as Record<ZoneId, number>;
    const frameWidth = this.frameSize().width;
    const frameHeight = this.frameSize().height;

    for (const point of frame.points) {
      const x = (point.x / frameWidth) * PLAN.width;
      const y = (point.y / frameHeight) * PLAN.height;
      const zone = ZONES.find((candidate) => {
        const area = ZONE_AREAS[candidate.id];
        return (
          x >= area.x &&
          x <= area.x + area.w &&
          y >= area.y &&
          y <= area.y + area.h
        );
      });
      if (zone) {
        standing[zone.id] += 1;
      }
    }

    return zonePercentages(standing, (zone) => zone.capacity);
  }

  /** Dot and text for the state of a channel; `receivingText` is what to say while messages arrive. */
  private describe(status: ChannelStatus, receivingText: string): { dot: string; text: string } {
    switch (status) {
      case 'off':
        return { dot: STATUS_DOT.off, text: 'Sin conectar' };
      case 'connecting':
        return { dot: STATUS_DOT.waiting, text: 'Conectando…' };
      case 'retrying':
        return { dot: STATUS_DOT.waiting, text: 'No responde: se reintenta cada segundo y medio' };
      case 'waiting':
        return { dot: STATUS_DOT.waiting, text: 'Conectado' };
      case 'silent':
        return {
          dot: STATUS_DOT.waiting,
          text: 'Conectado, pero no llega nada: el backend solo envía cuando recibe vídeo',
        };
      case 'receiving':
        return { dot: STATUS_DOT.ok, text: receivingText };
    }
  }

  private httpState(): { dot: string; text: string } {
    const error = this.backend.httpError();
    if (error) {
      return { dot: STATUS_DOT.waiting, text: error };
    }
    if (this.backend.config()) {
      return { dot: STATUS_DOT.ok, text: 'Responde: configuración leída' };
    }
    return this.backend.connected()
      ? { dot: STATUS_DOT.waiting, text: 'Leyendo la configuración…' }
      : { dot: STATUS_DOT.off, text: 'Sin conectar' };
  }
}

function source(base64: string | null | undefined): string | null {
  return base64 ? jpegSource(base64) : null;
}
