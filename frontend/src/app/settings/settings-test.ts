import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { BackendConnection } from '../core/backend-connection';
import { BackendConfig, jpegSource } from '../core/backend-protocol';
import { HEAT_GRADIENT } from '../shared/heat/heat-ramp';
import { Icon } from '../shared/icon';
import { VideoHeatmap } from './video-heatmap';

/** Frames per second sent to the model; the backend asks for 30 at most. */
const FRAMES_PER_SECOND = 12;
/** Width the frames are scaled to before sending: what the model works at by default. */
const FRAME_WIDTH = 640;
const JPEG_QUALITY = 0.7;
/** Pause after the last slider move before telling the model, so dragging does not flood it. */
const SETTLE_MS = 150;

const STATUS_DOT = {
  ok: 'bg-brand-green',
  waiting: 'bg-brand-orange',
  off: 'bg-ink-3',
} as const;

/**
 * Test mode: upload a video and tune how the heatmap is built from it.
 *
 * With the backend connected, the video is sent to the model frame by frame,
 * what the model renders is shown, and the sliders change its configuration.
 * Without it, a local preview stands in: heat from the movement in the video,
 * shaped by the same sliders.
 */
@Component({
  selector: 'app-settings-test',
  imports: [Icon, VideoHeatmap],
  providers: [BackendConnection],
  templateUrl: './settings-test.html',
})
export class SettingsTest {
  protected readonly backend = inject(BackendConnection);

  protected readonly videoUrl = signal<string | null>(null);
  protected readonly fileName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly paused = signal(false);
  protected readonly aspect = signal('16 / 9');

  // Same options, ranges and defaults as the model.
  protected readonly showCamera = signal(true);
  protected readonly radius = signal(31);
  protected readonly confidence = signal(0.4);
  protected readonly decay = signal(0.85);

  protected readonly heatGradient = HEAT_GRADIENT;

  /** The model is in charge while the channel to send it video is open. */
  protected readonly usingModel = computed(() => this.backend.streamStatus() === 'open');
  protected readonly cameraImage = computed(() => {
    const raw = this.backend.images()?.raw;
    return raw ? jpegSource(raw) : null;
  });
  protected readonly heatImage = computed(() => {
    const heat = this.backend.images()?.heat;
    return heat ? jpegSource(heat) : null;
  });
  protected readonly stats = computed(() => this.backend.frame()?.stats ?? null);

  protected readonly modelState = computed(() => {
    switch (this.backend.streamStatus()) {
      case 'off':
        return { dot: STATUS_DOT.off, text: 'Sin conectar: se usa la vista previa local' };
      case 'connecting':
        return { dot: STATUS_DOT.waiting, text: 'Conectando…' };
      case 'retrying':
        return {
          dot: STATUS_DOT.waiting,
          text: 'No responde: se reintenta, y mientras tanto se usa la vista previa local',
        };
      case 'open':
        if (!this.videoUrl()) {
          return { dot: STATUS_DOT.waiting, text: 'Conectado: sube un vídeo para enviárselo' };
        }
        if (this.paused()) {
          return { dot: STATUS_DOT.waiting, text: 'Conectado: el vídeo está en pausa' };
        }
        return this.backend.imageStatus() === 'receiving'
          ? { dot: STATUS_DOT.ok, text: 'Conectado: el modelo procesa el vídeo' }
          : { dot: STATUS_DOT.waiting, text: 'Conectado: esperando la respuesta del modelo' };
    }
  });

  /** The video being sent to the model; only in the page while the model is in charge. */
  private readonly source = viewChild<ElementRef<HTMLVideoElement>>('source');
  private readonly grabber = document.createElement('canvas');
  private encoding = false;
  private pending: BackendConfig = {};
  private settleTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.backend.connectIfRemembered({ sendVideo: true });
    effect(() => {
      // The sliders show what the model is really using.
      const config = this.backend.config();
      untracked(() => {
        if (typeof config?.['radius'] === 'number') {
          this.radius.set(config['radius']);
        }
        if (typeof config?.['confidence'] === 'number') {
          this.confidence.set(config['confidence']);
        }
        if (typeof config?.['decay'] === 'number') {
          this.decay.set(config['decay']);
        }
      });
    });
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const pump = setInterval(() => this.sendFrame(), 1000 / FRAMES_PER_SECOND);
      destroyRef.onDestroy(() => clearInterval(pump));
    });
    destroyRef.onDestroy(() => {
      clearTimeout(this.settleTimer);
      this.release();
    });
  }

  protected connect(event: Event, address: string): void {
    event.preventDefault();
    this.backend.connect(address, { sendVideo: true });
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.load(input.files?.[0]);
    // Lets the user pick the same file again.
    input.value = '';
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.load(event.dataTransfer?.files[0]);
  }

  protected hover(event: DragEvent, over: boolean): void {
    event.preventDefault();
    this.dragging.set(over);
  }

  /** A slider moved: keep the value and, with the model connected, pass it on. */
  protected tune(setting: 'radius' | 'confidence' | 'decay', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this[setting].set(value);
    if (!this.backend.connected()) {
      return;
    }
    this.pending = { ...this.pending, [setting]: value };
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      const changes = this.pending;
      this.pending = {};
      void this.backend.updateConfig(changes);
    }, SETTLE_MS);
  }

  protected checkedFrom(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** The video sent to the model has no controls of its own: this is its pause button. */
  protected togglePlay(): void {
    const video = this.source()?.nativeElement;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
    this.paused.set(video.paused);
  }

  /** Gives the picture the shape of the video and starts it. */
  protected fit(event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (video.videoWidth > 0) {
      this.aspect.set(`${video.videoWidth} / ${video.videoHeight}`);
    }
    this.paused.set(false);
    video.play().catch(() => this.paused.set(true));
  }

  /** Takes the current frame of the video and sends it to the model as a JPEG. */
  private sendFrame(): void {
    const video = this.source()?.nativeElement;
    if (!video || this.encoding || video.paused || video.ended || video.readyState < 2) {
      return;
    }
    const height = Math.round((FRAME_WIDTH * video.videoHeight) / video.videoWidth);
    if (this.grabber.width !== FRAME_WIDTH || this.grabber.height !== height) {
      this.grabber.width = FRAME_WIDTH;
      this.grabber.height = height;
    }
    const context = this.grabber.getContext('2d');
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0, FRAME_WIDTH, height);
    this.encoding = true;
    this.grabber.toBlob(
      (jpeg) => {
        this.encoding = false;
        if (jpeg) {
          this.backend.sendFrame(jpeg);
        }
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  }

  private load(file: File | undefined): void {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('video/')) {
      this.error.set(`«${file.name}» no es un vídeo.`);
      return;
    }
    this.release();
    this.error.set(null);
    this.fileName.set(file.name);
    this.videoUrl.set(URL.createObjectURL(file));
  }

  private release(): void {
    const url = this.videoUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
