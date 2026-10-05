import { FlowField } from './flow-field';

describe('FlowField', () => {
  it('should report the predominant direction of each cell, relative to the strongest', () => {
    const field = new FlowField(4, 2);
    // Cell (0, 0): people walk right. Cell (3, 1): fewer people walk up.
    field.add(0.1, 0.1, 10, 0);
    field.add(0.1, 0.1, 10, 0);
    field.add(0.9, 0.9, 0, -5);

    const vectors = field.vectors();

    expect(vectors).toEqual([
      { x: 0.125, y: 0.25, dx: 1, dy: 0, strength: 1 },
      { x: 0.875, y: 0.75, dx: 0, dy: -1, strength: 0.25 },
    ]);
  });

  it('should cancel opposite movements and leave weak cells out', () => {
    const field = new FlowField(4, 2);
    field.add(0.1, 0.1, 10, 0);
    field.add(0.1, 0.1, -10, 0);
    field.add(0.6, 0.1, 100, 0);
    field.add(0.9, 0.9, 1, 0);

    const vectors = field.vectors(0.08);

    expect(vectors.map((vector) => vector.x)).toEqual([0.625]);
  });

  it('should have nothing to show when empty or cleared', () => {
    const field = new FlowField(4, 2);
    expect(field.vectors()).toEqual([]);

    field.add(0.5, 0.5, 3, 4);
    field.fade(0.5);
    expect(field.vectors()[0]).toMatchObject({ dx: 0.6, dy: 0.8, strength: 1 });

    field.clear();
    expect(field.vectors()).toEqual([]);
  });
});
