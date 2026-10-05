// Spanish only groups from five digits on ("9367" next to "10.800"); always
// grouping keeps columns of figures consistent.
const NUMBER = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
  // The typings of this TypeScript target still only know the boolean values.
  useGrouping: 'always' as unknown as boolean,
});

/** Number in Spanish notation, e.g. 12.480 or 3,4. */
export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

/** Percentage change with an explicit sign, e.g. "+4,2 %". */
export function formatChange(percent: number): string {
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '';
  return `${sign}${NUMBER.format(Math.abs(percent))} %`;
}
