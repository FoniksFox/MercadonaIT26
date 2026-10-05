import { formatChange, formatNumber } from './format';

describe('format', () => {
  it('should group thousands from four digits on', () => {
    expect(formatNumber(9367)).toBe('9.367');
    expect(formatNumber(10800)).toBe('10.800');
    expect(formatNumber(3.44)).toBe('3,4');
  });

  it('should write changes with an explicit sign', () => {
    expect(formatChange(4.2)).toBe('+4,2 %');
    expect(formatChange(-0.7)).toBe('−0,7 %');
    expect(formatChange(0)).toBe('0 %');
  });
});
