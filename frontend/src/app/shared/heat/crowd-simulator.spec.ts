import { CrowdSimulator, route } from './crowd-simulator';
import { BOTTOM_CORRIDOR, PLAN, TOP_CORRIDOR } from './store-layout';

describe('route', () => {
  it('should go straight between two points of the same lane', () => {
    const from = { lane: 380, at: { x: 380, y: 200 } };
    const to = { lane: 380, at: { x: 380, y: 350 } };

    expect(route(from, to)).toEqual([to.at]);
  });

  it('should join two lanes through the nearest corridor, without cutting across shelves', () => {
    const from = { lane: 380, at: { x: 380, y: 180 } };
    const to = { lane: 580, at: { x: 580, y: 200 } };

    const path = [from.at, ...route(from, to)];

    expect(path).toEqual([
      { x: 380, y: 180 },
      { x: 380, y: TOP_CORRIDOR },
      { x: 580, y: TOP_CORRIDOR },
      { x: 580, y: 200 },
    ]);
  });

  it('should cross from one corridor to the other along a lane', () => {
    const from = { at: { x: 300, y: TOP_CORRIDOR } };
    const to = { at: { x: 320, y: BOTTOM_CORRIDOR } };

    const path = [from.at, ...route(from, to)];

    for (let i = 1; i < path.length; i++) {
      const straight = path[i].x === path[i - 1].x || path[i].y === path[i - 1].y;
      expect(straight).toBe(true);
    }
    expect(path.at(-1)).toEqual(to.at);
  });
});

describe('CrowdSimulator', () => {
  it('should fill the store, keep everyone inside it and let people leave', () => {
    const simulator = new CrowdSimulator('test');

    simulator.run(600, 0.25);

    expect(simulator.people).toBeGreaterThan(5);
    expect(simulator.people).toBeLessThan(70);
    for (const point of simulator.points()) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(PLAN.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(PLAN.height);
    }
    expect(simulator.dwell.checkout).toBeGreaterThan(0);
  });

  it('should count as occupancy only the people standing in a zone', () => {
    const simulator = new CrowdSimulator('test');
    simulator.run(300, 0.25);

    const standing = Object.values(simulator.occupancy()).reduce((sum, count) => sum + count, 0);

    expect(standing).toBeGreaterThan(0);
    expect(standing).toBeLessThanOrEqual(simulator.people);
  });

  it('should repeat the same crowd for the same seed, and be busier when asked', () => {
    const first = new CrowdSimulator('store-a');
    const second = new CrowdSimulator('store-a');
    const busy = new CrowdSimulator('store-a', 2);
    first.run(120, 0.5);
    second.run(120, 0.5);
    busy.run(120, 0.5);

    expect(second.points()).toEqual(first.points());
    expect(busy.people).toBeGreaterThan(first.people);
  });
});
