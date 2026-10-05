import { HeatField } from './heat-field';

describe('HeatField', () => {
  it('should add a blob that is hottest at its centre and fades with distance', () => {
    const field = new HeatField(20, 10);

    field.add(0.5, 0.5, 3, 1);

    const centre = field.valueAt(10, 5);
    expect(centre).toBeGreaterThan(0.5);
    expect(field.valueAt(12, 5)).toBeGreaterThan(0);
    expect(field.valueAt(12, 5)).toBeLessThan(centre);
    expect(field.valueAt(0, 0)).toBe(0);
    expect(field.max()).toBe(centre);
  });

  it('should keep blobs near the border inside the grid', () => {
    const field = new HeatField(20, 10);

    field.add(0, 1, 3, 1);

    expect(field.valueAt(0, 9)).toBeGreaterThan(0);
  });

  it('should cool down with fade and empty with clear', () => {
    const field = new HeatField(20, 10);
    field.add(0.5, 0.5, 3, 1);
    const before = field.valueAt(10, 5);

    field.fade(0.5);
    expect(field.valueAt(10, 5)).toBeCloseTo(before / 2);

    field.clear();
    expect(field.max()).toBe(0);
  });
});
