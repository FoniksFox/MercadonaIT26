import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { HeatField } from '../shared/heat/heat-field';
import { MotionSampler } from '../shared/heat/motion-sampler';

const COLS = 96;
const ROWS = 54;
/** Milliseconds between samples (about 15 per second, like the model). */
const SAMPLE_EVERY = 66;
/** Width in pixels the backend works at; `radius` is given at that size. */
const MODEL_WIDTH = 640;
const MIN_HOTTEST = 2;

/**
 * Plays a video with a heat overlay. Until the model is connected, the heat
 * comes from MotionSampler (movement between frames) and the three parameters
 * act on that stand-in the same way they will act on the model.
 */
@Component({
  selector: 'app-video-heatmap',
  host: { class: 'block' },
  template: `
    <div class="relative overflow-hidden rounded-xl bg-black" [style.aspect-ratio]="aspect()">
      <video
        #video
        class="block size-full object-contain transition-opacity"
        [class.opacity-0]="!showCamera()"
        [src]="src()"
        [muted]="true"
        loop
        autoplay
        playsinline
        controls
        (loadedmetadata)="fit()"
      ></video>
      <canvas #canvas class="pointer-events-none absolute inset-0 size-full"></canvas>
    </div>
  `,
})
export class VideoHeatmap {
  readonly src = input.required<string>();
  readonly showCamera = input(true);
  /** Size of the heat blob, in pixels of the model frame (11..101). */
  readonly radius = input(31);
  /** Minimum certainty to count a detection (0.1..0.9). */
  readonly confidence = input(0.4);
  /** Share of the heat kept from one sample to the next (0..0.99). */
  readonly decay = input(0.85);

  protected readonly aspect = signal('16 / 9');

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly field = new HeatField(COLS, ROWS);
  private readonly sampler = new MotionSampler(COLS, ROWS);
  private probe?: CanvasRenderingContext2D | null;
  private hottest = MIN_HOTTEST;
  private lastSample = 0;
  private frameId = 0;

  constructor() {
    effect(() => {
      this.src();
      untracked(() => {
        this.field.clear();
        this.sampler.reset();
        this.hottest = MIN_HOTTEST;
      });
    });
    afterNextRender(() => {
      this.frameId = requestAnimationFrame(this.frame);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frameId));
  }

  /** Gives the box the shape of the video and starts it. */
  protected fit(): void {
    const video = this.videoRef().nativeElement;
    if (video.videoWidth > 0) {
      this.aspect.set(`${video.videoWidth} / ${video.videoHeight}`);
    }
    video.play().catch(() => {
      // Autoplay refused: the controls are there to start it by hand.
    });
  }

  private readonly frame = (now: number): void => {
    const video = this.videoRef().nativeElement;
    const playing = !video.paused && !video.ended && video.readyState >= 2;
    if (playing && now - this.lastSample >= SAMPLE_EVERY) {
      this.lastSample = now;
      this.sample(video);
    }
    this.paint();
    this.frameId = requestAnimationFrame(this.frame);
  };

  private sample(video: HTMLVideoElement): void {
    if (this.probe === undefined) {
      const canvas = video.ownerDocument.createElement('canvas');
      canvas.width = COLS;
      canvas.height = ROWS;
      this.probe = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.probe) {
      return;
    }
    this.probe.drawImage(video, 0, 0, COLS, ROWS);
    const pixels = this.probe.getImageData(0, 0, COLS, ROWS).data;

    this.field.fade(this.decay());
    const threshold = 12 + this.confidence() * 60;
    const radius = ((10 + 0.3 * this.radius()) / MODEL_WIDTH) * COLS;
    for (const cell of this.sampler.changes(pixels, threshold)) {
      this.field.add((cell.col + 0.5) / COLS, (cell.row + 0.5) / ROWS, radius, cell.strength);
    }
    this.hottest = Math.max(MIN_HOTTEST, this.hottest * 0.99, this.field.max());
  }

  private paint(): void {
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
    this.field.paint(context, width, height, this.hottest);
  }
}
