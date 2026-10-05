// Messages of the vision backend (see model/API.md) and helpers to read them.
// Everything that arrives is checked: a malformed message is dropped, not trusted.

/** One tracked person, in pixels of the frame the backend processed. */
export interface BackendPoint {
  id: number;
  x: number;
  y: number;
}

/** One of the spots with most traffic, in pixels of the processed frame. */
export interface BackendHotspot {
  rank: number;
  x: number;
  y: number;
  traffic: number;
}

export interface BackendStats {
  /** People in view right now. */
  count: number;
  /** Frames per second the model is processing. */
  fps: number;
  /** Milliseconds the last frame took. */
  latency: number;
  /** "cuda" or "cpu". */
  device: string;
  hotspots: BackendHotspot[];
}

/** A message of `/ws/v1/heatmap/data`: what the model saw in one frame. */
export interface BackendFrame {
  timestamp: number;
  /** Size in pixels of the frame the points refer to; `null` if the backend does not say. */
  size: { width: number; height: number } | null;
  stats: BackendStats;
  points: BackendPoint[];
}

/**
 * A message of `/ws/v1/video/demo`: images the backend already rendered, as
 * base64 JPEG. An image is `null` when the backend is not producing it.
 */
export interface BackendImages {
  raw: string | null;
  heat: string | null;
  flow: string | null;
  persistentHeat: string | null;
}

/** `GET /api/v1/config`: the model's settings, by name. */
export type BackendConfig = Record<string, number | boolean>;

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): Json | null {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function located(value: unknown): value is Json & { x: number; y: number } {
  return isRecord(value) && Number.isFinite(value['x']) && Number.isFinite(value['y']);
}

/** Reads a data message. Returns `null` unless it has stats and a list of points. */
export function parseFrame(text: string): BackendFrame | null {
  const message = parseJson(text);
  if (!message) {
    return null;
  }
  const stats = message['stats'];
  const points = message['points'];
  if (!isRecord(stats) || !Array.isArray(points)) {
    return null;
  }
  const hotspots = Array.isArray(stats['hotspots']) ? stats['hotspots'] : [];
  // The size comes at the top level, and also inside `frame_size` and `stats`.
  const sized = [message, message['frame_size'], stats].find(
    (part): part is Json =>
      isRecord(part) && number(part['width']) > 0 && number(part['height']) > 0,
  );
  return {
    timestamp: number(message['timestamp']),
    size: sized ? { width: number(sized['width']), height: number(sized['height']) } : null,
    stats: {
      count: number(stats['count']),
      fps: number(stats['fps']),
      latency: number(stats['latency']),
      device: typeof stats['device'] === 'string' ? stats['device'] : '',
      hotspots: hotspots.filter(located).map((spot, i) => ({
        rank: number(spot['rank'], i + 1),
        x: spot.x,
        y: spot.y,
        traffic: number(spot['traffic']),
      })),
    },
    points: points.filter(located).map((point, i) => ({
      id: number(point['id'], -1 - i),
      x: point.x,
      y: point.y,
    })),
  };
}

/** Reads a demo message. Returns `null` when it is not a JSON object. */
export function parseImages(text: string): BackendImages | null {
  const message = parseJson(text);
  if (!message) {
    return null;
  }
  const image = (key: string) => {
    const value = message[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };
  return {
    raw: image('image_raw'),
    heat: image('image_heat'),
    flow: image('image_flow'),
    persistentHeat: image('image_persistent_heat'),
  };
}

/** `src` for an `<img>` from one of the backend's base64 JPEG images. */
export function jpegSource(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Turns what the user typed (an address, with or without `http://`, or the
 * link to the backend's own dashboard) into its HTTP and WebSocket bases.
 */
export function backendUrls(address: string): { http: string; ws: string } | null {
  const text = address.trim();
  if (!text) {
    return null;
  }
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
    const secure = url.protocol === 'https:' || url.protocol === 'wss:';
    if (!secure && url.protocol !== 'http:' && url.protocol !== 'ws:') {
      return null;
    }
    return {
      http: `${secure ? 'https' : 'http'}://${url.host}`,
      ws: `${secure ? 'wss' : 'ws'}://${url.host}`,
    };
  } catch {
    return null;
  }
}
