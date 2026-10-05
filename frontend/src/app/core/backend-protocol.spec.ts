import { backendUrls, jpegSource, parseFrame, parseImages } from './backend-protocol';

describe('parseFrame', () => {
  it('should read a data message as documented in model/API.md', () => {
    const frame = parseFrame(
      JSON.stringify({
        timestamp: 1696512345000,
        stats: {
          count: 2,
          fps: 28,
          latency: 35,
          device: 'cuda',
          hotspots: [{ rank: 1, x: 320, y: 240, traffic: 150.5 }],
        },
        points: [
          { id: 1, x: 120, y: 300 },
          { id: 2, x: 400, y: 210 },
        ],
      }),
    );

    expect(frame).toEqual({
      timestamp: 1696512345000,
      size: null,
      stats: {
        count: 2,
        fps: 28,
        latency: 35,
        device: 'cuda',
        hotspots: [{ rank: 1, x: 320, y: 240, traffic: 150.5 }],
      },
      points: [
        { id: 1, x: 120, y: 300 },
        { id: 2, x: 400, y: 210 },
      ],
    });
  });

  it('should read the size of the frame wherever the backend puts it', () => {
    const body = { stats: { count: 0, fps: 1, latency: 1, device: 'cpu' }, points: [] };

    expect(parseFrame(JSON.stringify({ ...body, width: 640, height: 360 }))?.size).toEqual({
      width: 640,
      height: 360,
    });
    expect(
      parseFrame(JSON.stringify({ ...body, frame_size: { width: 480, height: 270 } }))?.size,
    ).toEqual({ width: 480, height: 270 });
    expect(
      parseFrame(JSON.stringify({ ...body, stats: { ...body.stats, width: 320, height: 180 } }))
        ?.size,
    ).toEqual({ width: 320, height: 180 });
    expect(parseFrame(JSON.stringify({ ...body, width: 0, height: 0 }))?.size).toBeNull();
  });

  it('should accept a message without hotspots and drop points without a position', () => {
    const frame = parseFrame(
      JSON.stringify({
        timestamp: 1,
        stats: { count: 1, fps: 10, latency: 90, device: 'cpu' },
        points: [{ id: 7, x: 10, y: 20 }, { id: 8, x: 'left' }, null],
      }),
    );

    expect(frame?.stats.hotspots).toEqual([]);
    expect(frame?.points).toEqual([{ id: 7, x: 10, y: 20 }]);
  });

  it('should reject anything that is not a data message', () => {
    expect(parseFrame('not json')).toBeNull();
    expect(parseFrame('[1, 2]')).toBeNull();
    expect(parseFrame(JSON.stringify({ stats: {} }))).toBeNull();
    expect(parseFrame(JSON.stringify({ points: [] }))).toBeNull();
  });
});

describe('parseImages', () => {
  it('should read the four images, keeping null for the ones the backend skips', () => {
    const images = parseImages(
      JSON.stringify({ image_raw: 'AAA', image_heat: 'BBB', image_flow: null }),
    );

    expect(images).toEqual({ raw: 'AAA', heat: 'BBB', flow: null, persistentHeat: null });
    expect(jpegSource('AAA')).toBe('data:image/jpeg;base64,AAA');
  });

  it('should reject a message that is not an object', () => {
    expect(parseImages('nope')).toBeNull();
  });
});

describe('backendUrls', () => {
  it('should accept an address with or without the protocol', () => {
    const expected = { http: 'http://192.168.1.50:8000', ws: 'ws://192.168.1.50:8000' };

    expect(backendUrls('192.168.1.50:8000')).toEqual(expected);
    expect(backendUrls(' http://192.168.1.50:8000/ ')).toEqual(expected);
    expect(backendUrls('ws://192.168.1.50:8000')).toEqual(expected);
  });

  it('should accept the link to the dashboard of the backend', () => {
    expect(backendUrls('http://10.0.0.7:8000/static/dashboard.html')).toEqual({
      http: 'http://10.0.0.7:8000',
      ws: 'ws://10.0.0.7:8000',
    });
  });

  it('should use secure sockets for an https address', () => {
    expect(backendUrls('https://demo.example.org')).toEqual({
      http: 'https://demo.example.org',
      ws: 'wss://demo.example.org',
    });
  });

  it('should reject an empty or unusable address', () => {
    expect(backendUrls('   ')).toBeNull();
    expect(backendUrls('ftp://host')).toBeNull();
    expect(backendUrls('http://')).toBeNull();
  });
});
