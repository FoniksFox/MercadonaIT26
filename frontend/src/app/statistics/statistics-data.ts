import { seededRandom } from '../core/random';
import { Supermarket } from '../core/supermarkets';
import { ZONES, Zone, ZoneId } from '../core/zones';

// Placeholder statistics, stable per store and range, until the backend has history.

export type StatsRange = 'today' | 'week' | 'month';

/** Hours the store is open; each one stands for the hour that starts then. */
export const OPENING_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] as const;
export const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

/** How busy each opening hour and each weekday is, relative to the busiest. */
const HOUR_SHAPE = [0.45, 0.7, 0.9, 1, 0.95, 0.6, 0.45, 0.5, 0.7, 0.95, 1.1, 1, 0.6];
const DAY_SHAPE = [0.95, 0.85, 0.85, 0.9, 1.1, 1.3];
const PEAK_PEOPLE_PER_HOUR = 240;
const OPEN_DAYS = { week: 6, month: 26 } as const;

const STAY_MINUTES: Record<ZoneId, number> = {
  fruit: 3.4,
  bakery: 1.6,
  pantry: 4.2,
  butcher: 3.8,
  drinks: 1.9,
  deli: 4.4,
  household: 2.3,
  fish: 4.9,
  dairy: 2.8,
  checkout: 5.6,
};

export interface ZoneValue {
  zone: Zone;
  value: number;
}

export interface StatsData {
  visitors: number;
  /** Change against the previous period, in percent. */
  visitorsChange: number;
  stayMinutes: number;
  stayChange: number;
  peakHour: string;
  mostVisited: Zone;
  /** People coming in per hour; `null` for hours of today that are not over yet. */
  hourly: (number | null)[];
  /** Only for today: the mean of last week per hour, to compare against. */
  hourlyReference: number[] | null;
  /** Visits per section, most visited first. Tills are left out: everyone passes them. */
  visitsByZone: ZoneValue[];
  /** Mean minutes per visit in each zone, longest first. */
  stayByZone: ZoneValue[];
  /** People per hour by weekday; `null` when the range is a single day. */
  weekGrid: { day: string; values: number[] }[] | null;
}

export function buildStats(store: Supermarket, range: StatsRange, now = new Date()): StatsData {
  const random = seededRandom(`${store.id}:${range}:stats`);
  const noise = () => 0.9 + random() * 0.2;
  const peak = PEAK_PEOPLE_PER_HOUR * store.busyness;

  const typical = HOUR_SHAPE.map((share) => Math.round(peak * share * noise()));
  const today = range === 'today';
  const hourly = today
    ? OPENING_HOURS.map((hour, i) =>
        hour < now.getHours() ? Math.round(typical[i] * (0.85 + random() * 0.3)) : null,
      )
    : typical;

  const perDay = hourly.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const visitors = today ? perDay : Math.round(perDay * OPEN_DAYS[range] * noise());

  const peakIndex = typical.indexOf(Math.max(...typical));
  const visitsByZone = ZONES.filter((zone) => zone.id !== 'checkout')
    .map((zone) => ({
      zone,
      value: Math.round(visitors * (0.25 + 0.45 * zone.popularity) * noise()),
    }))
    .sort((a, b) => b.value - a.value);

  return {
    visitors,
    visitorsChange: Math.round((random() * 16 - 6) * 10) / 10,
    stayMinutes: Math.round(19 + random() * 8),
    stayChange: Math.round((random() * 8 - 4) * 10) / 10,
    peakHour: `${OPENING_HOURS[peakIndex]}:00 – ${OPENING_HOURS[peakIndex] + 1}:00`,
    mostVisited: visitsByZone[0].zone,
    hourly,
    hourlyReference: today ? typical : null,
    visitsByZone,
    stayByZone: ZONES.map((zone) => ({
      zone,
      value: Math.round(STAY_MINUTES[zone.id] * noise() * 10) / 10,
    })).sort((a, b) => b.value - a.value),
    weekGrid: today
      ? null
      : WEEK_DAYS.map((day, d) => ({
          day,
          values: HOUR_SHAPE.map((share) => Math.round(peak * share * DAY_SHAPE[d] * noise())),
        })),
  };
}
