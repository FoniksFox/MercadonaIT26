import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  BackendConfig,
  BackendFrame,
  BackendImages,
  backendUrls,
  parseFrame,
  parseImages,
} from './backend-protocol';
import { readStored, writeStored } from './browser-storage';

/**
 * State of one WebSocket channel.
 * - `retrying`: it could not be opened, or it dropped, and is being opened again.
 * - `waiting`: just opened, nothing has arrived yet.
 * - `receiving`: messages are arriving.
 * - `silent`: open, but nothing has arrived for a while.
 */
export type ChannelStatus = 'off' | 'connecting' | 'retrying' | 'waiting' | 'receiving' | 'silent';

export interface ReceivedCounts {
  /** Data messages read. */
  data: number;
  /** Image messages read. */
  images: number;
  /** Messages that could not be understood. */
  invalid: number;
}

const ADDRESS_KEY = 'mercatrack.backend';
const DEFAULT_ADDRESS = 'http://localhost:8000';
const RETRY_MS = 1500;
/** The text of the last data message is only kept this often; it is for reading, not for drawing. */
const SAMPLE_EVERY_MS = 500;
/** Without messages for this long, an open channel counts as silent. */
const SILENT_AFTER_MS = 2000;

type Channel = 'data' | 'images';

/**
 * Live connection to the vision backend: the data channel (people and stats),
 * the image channel (frames it rendered) and its REST endpoints.
 *
 * Provide it in the component that uses it: the sockets close with it.
 */
@Injectable()
export class BackendConnection {
  readonly address = signal(readStored(ADDRESS_KEY) ?? DEFAULT_ADDRESS);
  /** Set when the address typed by the user cannot be used. */
  readonly addressError = signal<string | null>(null);
  /** The user asked to be connected; channels reopen by themselves while it is on. */
  readonly connected = signal(false);

  readonly dataStatus = signal<ChannelStatus>('off');
  readonly imageStatus = signal<ChannelStatus>('off');

  /** Latest data message. Updated at most once per animation frame. */
  readonly frame = signal<BackendFrame | null>(null);
  /** Latest rendered images. Updated at most once per animation frame. */
  readonly images = signal<BackendImages | null>(null);
  /** Text of a recent data message, as it arrived. */
  readonly sample = signal('');
  readonly received = signal<ReceivedCounts>({ data: 0, images: 0, invalid: 0 });
  readonly dataPerSecond = signal(0);

  readonly config = signal<BackendConfig | null>(null);
  /** Why the last HTTP request failed, if it did. */
  readonly httpError = signal<string | null>(null);

  /**
   * Called with every data message as it arrives, not throttled like the
   * signals: use it to accumulate (heat, flow) without losing frames.
   */
  onFrame: ((frame: BackendFrame) => void) | null = null;

  private urls: { http: string; ws: string } | null = null;
  private readonly sockets: Partial<Record<Channel, WebSocket>> = {};
  private readonly retries: Partial<Record<Channel, ReturnType<typeof setTimeout>>> = {};
  private counts: ReceivedCounts = { data: 0, images: 0, invalid: 0 };
  private latestFrame: BackendFrame | null = null;
  private latestImages: BackendImages | null = null;
  private latestText = '';
  private lastSample = 0;
  private flushId = 0;
  private dataThisSecond = 0;
  /** When each channel was opened and when its last message arrived. */
  private readonly openedAt: Record<Channel, number> = { data: 0, images: 0 };
  private readonly lastMessageAt: Record<Channel, number> = { data: 0, images: 0 };
  private readonly rateTimer = setInterval(() => {
    this.dataPerSecond.set(this.dataThisSecond);
    this.dataThisSecond = 0;
  }, 1000);
  private readonly silenceTimer = setInterval(() => this.noticeSilence(), 500);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.disconnect();
      clearInterval(this.rateTimer);
      clearInterval(this.silenceTimer);
    });
  }

  /** Connects to `address` (or to the current one) and keeps the channels open. */
  connect(address = this.address()): void {
    const urls = backendUrls(address);
    if (!urls) {
      this.addressError.set('Escribe la dirección del backend, por ejemplo 192.168.1.50:8000');
      return;
    }
    this.disconnect();
    this.addressError.set(null);
    this.address.set(urls.http);
    writeStored(ADDRESS_KEY, urls.http);
    this.urls = urls;
    this.counts = { data: 0, images: 0, invalid: 0 };
    this.received.set(this.counts);
    this.connected.set(true);
    this.open('data');
    this.open('images');
    void this.loadConfig();
  }

  /** Connects straight away when an address was used before on this device. */
  connectIfRemembered(): void {
    if (readStored(ADDRESS_KEY)) {
      this.connect();
    }
  }

  disconnect(): void {
    this.connected.set(false);
    for (const channel of ['data', 'images'] as const) {
      clearTimeout(this.retries[channel]);
      const socket = this.sockets[channel];
      if (socket) {
        socket.onclose = null;
        socket.close();
        delete this.sockets[channel];
      }
      this.status(channel).set('off');
    }
    cancelAnimationFrame(this.flushId);
    this.flushId = 0;
  }

  /** `GET /api/v1/config`. */
  async loadConfig(): Promise<void> {
    const config = await this.request('GET', '/api/v1/config');
    if (config) {
      this.config.set(config as BackendConfig);
    }
  }

  /** `POST /api/v1/heatmap/clear`: empties the maps the backend keeps. */
  async clearMaps(): Promise<boolean> {
    return (await this.request('POST', '/api/v1/heatmap/clear')) !== null;
  }

  private status(channel: Channel) {
    return channel === 'data' ? this.dataStatus : this.imageStatus;
  }

  private open(channel: Channel): void {
    if (!this.urls) {
      return;
    }
    const path = channel === 'data' ? '/ws/v1/heatmap/data' : '/ws/v1/video/demo';
    const status = this.status(channel);
    if (status() !== 'retrying') {
      status.set('connecting');
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.urls.ws + path);
    } catch {
      // E.g. an insecure socket requested from an https page.
      status.set('retrying');
      this.retries[channel] = setTimeout(() => this.open(channel), RETRY_MS);
      return;
    }
    this.sockets[channel] = socket;
    socket.onopen = () => {
      this.openedAt[channel] = performance.now();
      this.lastMessageAt[channel] = 0;
      status.set('waiting');
    };
    socket.onmessage = (event) => this.read(channel, event.data);
    socket.onclose = () => {
      delete this.sockets[channel];
      if (channel === 'data') {
        this.dataThisSecond = 0;
        this.dataPerSecond.set(0);
      }
      if (this.connected()) {
        status.set('retrying');
        this.retries[channel] = setTimeout(() => this.open(channel), RETRY_MS);
      }
    };
  }

  /** An open channel that stops receiving is flagged, so a stalled backend is not mistaken for a quiet store. */
  private noticeSilence(): void {
    const now = performance.now();
    for (const channel of ['data', 'images'] as const) {
      const open = this.sockets[channel]?.readyState === WebSocket.OPEN;
      const quietSince = Math.max(this.openedAt[channel], this.lastMessageAt[channel]);
      if (open && now - quietSince > SILENT_AFTER_MS) {
        this.status(channel).set('silent');
      }
    }
  }

  private markReceived(channel: Channel): void {
    this.lastMessageAt[channel] = performance.now();
    this.status(channel).set('receiving');
  }

  private read(channel: Channel, data: unknown): void {
    if (typeof data !== 'string') {
      this.counts = { ...this.counts, invalid: this.counts.invalid + 1 };
    } else if (channel === 'data') {
      const frame = parseFrame(data);
      if (frame) {
        this.latestFrame = frame;
        this.latestText = data;
        this.dataThisSecond += 1;
        this.counts = { ...this.counts, data: this.counts.data + 1 };
        this.markReceived(channel);
        this.onFrame?.(frame);
      } else {
        this.counts = { ...this.counts, invalid: this.counts.invalid + 1 };
      }
    } else {
      const images = parseImages(data);
      if (images) {
        this.latestImages = images;
        this.counts = { ...this.counts, images: this.counts.images + 1 };
        this.markReceived(channel);
      } else {
        this.counts = { ...this.counts, invalid: this.counts.invalid + 1 };
      }
    }
    // Messages can arrive faster than the screen refreshes: publish the latest once per frame.
    this.flushId ||= requestAnimationFrame((now) => this.flush(now));
  }

  private flush(now: number): void {
    this.flushId = 0;
    this.frame.set(this.latestFrame);
    this.images.set(this.latestImages);
    this.received.set(this.counts);
    if (now - this.lastSample > SAMPLE_EVERY_MS) {
      this.lastSample = now;
      this.sample.set(this.latestText);
    }
  }

  private async request(method: 'GET' | 'POST', path: string): Promise<unknown> {
    if (!this.urls) {
      return null;
    }
    try {
      const response = await fetch(this.urls.http + path, { method });
      if (!response.ok) {
        this.httpError.set(`El backend respondió ${response.status} a ${method} ${path}.`);
        return null;
      }
      this.httpError.set(null);
      return (await response.json()) as unknown;
    } catch {
      // The browser hides the reason; with the sockets working it is almost always CORS.
      this.httpError.set(
        `No se pudo hacer ${method} ${path}. Si los datos sí llegan, al backend le falta permitir peticiones desde otra dirección (CORS).`,
      );
      return null;
    }
  }
}
