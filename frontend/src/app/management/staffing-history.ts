import { seededRandom } from '../core/random';
import { Supermarket } from '../core/supermarkets';
import { ZONES, Zone, ZoneId } from '../core/zones';
import { DAY_SHAPE, HOUR_SHAPE, OPENING_HOURS, WEEK_DAYS } from '../statistics/statistics-data';
import { STAFF_PLAN, assess, staffUnits } from './staffing';

// Where and when staff fell short over a past period. Placeholder figures,
// stable per store and period, built on the same busy hours and days as the
// statistics, until the backend has the real history.

export type HistoryRange = 'today' | 'week' | 'month';

export interface ZoneShortage {
  zone: Zone;
  /** Opening hours in which the zone had enough staff, as a percentage. */
  coveredShare: number;
  /** Opening hours in which it did not. */
  shortHours: number;
  /** Most people (or tills) it was missing at once. */
  peakMissing: number;
  /** What to change in the rota; `null` when the zone coped. */
  recommendation: string | null;
}

export interface StaffingHistory {
  /** Opening hours in which at least one zone was short of staff. */
  shortHours: number;
  /** Opening hours in which every zone was covered, as a percentage. */
  coveredShare: number;
  /** The zone short for most hours; `null` when none was. */
  worstZone: Zone | null;
  /** When most staff was missing, e.g. "Sábados, 12:00 – 13:00"; `null` when never. */
  worstSlot: string | null;
  /** Every zone, most short hours first. */
  zones: ZoneShortage[];
  /** Staff missing in the whole store per hour (mean), by weekday or for today. */
  grid: { label: string; values: number[] }[];
  /** Hours of the grid columns. */
  hours: number[];
}

/** Customers standing in each zone at a typical peak hour of an average store. */
const PEAK_CUSTOMERS: Record<ZoneId, number> = {
  fruit: 5.6,
  bakery: 2.2,
  pantry: 5,
  butcher: 4.2,
  drinks: 3,
  deli: 2.1,
  household: 2.5,
  fish: 1.9,
  dairy: 4.4,
  checkout: 9,
};

const OPEN_DAYS = { week: 6, month: 26 } as const;
const PLURAL_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'];
/** Mean staff missing from which an hour belongs to the stretch a recommendation covers. */
const WORTH_COVERING = 0.5;

export function buildStaffingHistory(
  store: Supermarket,
  range: HistoryRange,
  now = new Date(),
): StaffingHistory {
  const random = seededRandom(`${store.id}:${range}:staffing`);
  const today = range === 'today';

  // Days in the period, as weekday indexes (0 = Monday ... 5 = Saturday; closed on Sunday).
  const todayIndex = (now.getDay() + 6) % 7;
  const days = today
    ? todayIndex < WEEK_DAYS.length
      ? [todayIndex]
      : []
    : Array.from({ length: OPEN_DAYS[range] }, (_, i) => i % WEEK_DAYS.length);
  // Today only the hours that are over count.
  const hours = OPENING_HOURS.filter((hour) => !today || hour < now.getHours());

  const rows = today ? 1 : WEEK_DAYS.length;
  const rowOf = (day: number) => (today ? 0 : day);
  const empty = () => Array.from({ length: rows }, () => hours.map(() => 0));
  const missingByZone = Object.fromEntries(ZONES.map((zone) => [zone.id, empty()])) as Record<
    ZoneId,
    number[][]
  >;
  const daysPerRow = Array.from({ length: rows }, () => 0);
  const shortHoursOf = Object.fromEntries(ZONES.map((zone) => [zone.id, 0])) as Record<
    ZoneId,
    number
  >;
  const peakOf = { ...shortHoursOf };
  let shortHours = 0;

  for (const day of days) {
    daysPerRow[rowOf(day)] += 1;
    hours.forEach((_, h) => {
      const busy = HOUR_SHAPE[h] * DAY_SHAPE[day] * store.busyness;
      let anyShort = false;
      for (const zone of ZONES) {
        const customers = PEAK_CUSTOMERS[zone.id] * busy * (0.85 + random() * 0.3);
        const { missing } = assess(zone.id, customers, STAFF_PLAN[zone.id]);
        if (missing > 0) {
          anyShort = true;
          shortHoursOf[zone.id] += 1;
          peakOf[zone.id] = Math.max(peakOf[zone.id], missing);
          missingByZone[zone.id][rowOf(day)][h] += missing;
        }
      }
      shortHours += anyShort ? 1 : 0;
    });
  }

  // Mean staff missing per hour of each row, per zone and for the whole store.
  const mean = (totals: number[][]) =>
    totals.map((row, r) => row.map((total) => (daysPerRow[r] ? total / daysPerRow[r] : 0)));
  const meanByZone = Object.fromEntries(
    ZONES.map((zone) => [zone.id, mean(missingByZone[zone.id])]),
  ) as Record<ZoneId, number[][]>;
  const labels = today ? ['Hoy'] : [...WEEK_DAYS];
  const grid = labels.map((label, r) => ({
    label,
    values: hours.map((_, h) =>
      round1(ZONES.reduce((sum, zone) => sum + meanByZone[zone.id][r][h], 0)),
    ),
  }));

  const openHours = days.length * hours.length;
  const share = (short: number) =>
    openHours ? Math.round(((openHours - short) / openHours) * 100) : 100;
  const dayName = (row: number, plural: boolean) =>
    today ? 'Hoy' : plural ? PLURAL_DAYS[row] : WEEK_DAYS[row];

  const zones = ZONES.map((zone): ZoneShortage => {
    const stretch = worstStretch(meanByZone[zone.id]);
    return {
      zone,
      coveredShare: share(shortHoursOf[zone.id]),
      shortHours: shortHoursOf[zone.id],
      peakMissing: peakOf[zone.id],
      recommendation: stretch
        ? `${zone.id === 'checkout' ? 'Abrir' : 'Añadir'} ${staffUnits(zone.id, stretch.staff)}${
            zone.id === 'checkout' ? ' más' : ''
          } ${today ? 'hoy' : 'los ' + dayName(stretch.row, true).toLowerCase()} de ${hours[stretch.from]}:00 a ${endOf(
            hours[stretch.to],
          )}`
        : null,
    };
  }).sort((a, b) => b.shortHours - a.shortHours);

  const worst = peakCell(grid.map((row) => row.values));
  return {
    shortHours,
    coveredShare: share(shortHours),
    worstZone: zones[0]?.shortHours ? zones[0].zone : null,
    worstSlot: worst
      ? `${dayName(worst.row, true)}, ${hours[worst.col]}:00 – ${endOf(hours[worst.col])}`
      : null,
    zones,
    grid,
    hours: [...hours],
  };
}

/** When the hour that starts at `hour` ends; the store closes at 21:30. */
function endOf(hour: number): string {
  return hour === OPENING_HOURS[OPENING_HOURS.length - 1] ? '21:30' : `${hour + 1}:00`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Position of the highest value above zero. */
function peakCell(grid: number[][]): { row: number; col: number } | null {
  let best: { row: number; col: number } | null = null;
  let highest = 0;
  grid.forEach((row, r) =>
    row.forEach((value, c) => {
      if (value > highest) {
        highest = value;
        best = { row: r, col: c };
      }
    }),
  );
  return best;
}

/**
 * The stretch of hours around a zone's worst moment that is worth covering:
 * which row (day), from which hour to which, and with how many more staff.
 */
function worstStretch(
  missing: number[][],
): { row: number; from: number; to: number; staff: number } | null {
  // The day that needed most staff overall, and its worst hour: several days can tie on the peak.
  const totals = missing.map((row) => row.reduce((sum, value) => sum + value, 0));
  const worstRow = totals.indexOf(Math.max(...totals));
  if (!(totals[worstRow] > 0)) {
    return null;
  }
  const row = missing[worstRow];
  const peak = { row: worstRow, col: row.indexOf(Math.max(...row)) };
  let from = peak.col;
  let to = peak.col;
  while (from > 0 && row[from - 1] >= WORTH_COVERING) {
    from -= 1;
  }
  while (to < row.length - 1 && row[to + 1] >= WORTH_COVERING) {
    to += 1;
  }
  return { row: peak.row, from, to, staff: Math.max(1, Math.round(row[peak.col])) };
}
