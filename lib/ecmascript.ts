const ArrayPrototypePush = Array.prototype.push;
const IntlDateTimeFormat = globalThis.Intl.DateTimeFormat;
const MathMin = Math.min;
const MathMax = Math.max;
const MathAbs = Math.abs;
const MathFloor = Math.floor;
const MathSign = Math.sign;
const MathTrunc = Math.trunc;
const NumberIsNaN = Number.isNaN;
const NumberIsFinite = Number.isFinite;
const NumberCtor = Number;
const NumberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectIs = Object.is;
const ReflectApply = Reflect.apply;

import { DEBUG } from './debug';
import JSBI from 'jsbi';

import type { Temporal } from '..';
import { GetIntrinsic } from './intrinsicclass';
import {
  CreateSlots,
  GetSlot,
  HasSlot,
  SetSlot,
  EPOCHNANOSECONDS,
  TIMEZONE_ID,
  CALENDAR_ID,
  INSTANT,
  ISO_YEAR,
  ISO_MONTH,
  ISO_DAY,
  ISO_HOUR,
  ISO_MINUTE,
  ISO_SECOND,
  ISO_MILLISECOND,
  ISO_MICROSECOND,
  ISO_NANOSECOND,
  DATE_BRAND,
  YEAR_MONTH_BRAND,
  MONTH_DAY_BRAND,
  TIME_ZONE,
  CALENDAR,
  YEARS,
  MONTHS,
  WEEKS,
  DAYS,
  HOURS,
  MINUTES,
  SECONDS,
  MILLISECONDS,
  MICROSECONDS,
  NANOSECONDS
} from './slots';
import { IsBuiltinCalendar } from './calendar';

const DAY_SECONDS = 86400;
const DAY_NANOS = JSBI.multiply(JSBI.BigInt(DAY_SECONDS), JSBI.BigInt(1e9));
const NS_MIN = JSBI.multiply(JSBI.BigInt(-86400), JSBI.BigInt(1e17));
const NS_MAX = JSBI.multiply(JSBI.BigInt(86400), JSBI.BigInt(1e17));
const YEAR_MIN = -271821;
const YEAR_MAX = 275760;
const BEFORE_FIRST_DST = JSBI.multiply(JSBI.BigInt(-388152), JSBI.BigInt(1e13)); // 1847-01-01T00:00:00Z

function IsInteger(value: unknown): value is number {
  if (typeof value !== 'number' || !NumberIsFinite(value)) return false;
  const abs = MathAbs(value);
  return MathFloor(abs) === abs;
}

// For unknown values, this narrows the result to a Record. But for union types
// like `Temporal.DurationLike | string`, it'll strip the primitive types while
// leaving the object type(s) unchanged.
export function IsObject<T>(
  value: T
): value is Exclude<T, string | null | undefined | number | bigint | symbol | boolean>;
export function IsObject(value: unknown): value is Record<string | number | symbol, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export function ToNumber(value: unknown): number {
  if (typeof value === 'bigint') throw new TypeError('Cannot convert BigInt to number');
  return NumberCtor(value);
}

function ToInteger(value: unknown): number {
  const num = ToNumber(value);
  if (NumberIsNaN(num)) return 0;
  const integer = MathTrunc(num);
  if (num === 0) return 0;
  return integer;
}

export function ToString(value: unknown): string {
  if (typeof value === 'symbol') {
    throw new TypeError('Cannot convert a Symbol value to a String');
  }
  return String(value);
}

export function ToIntegerThrowOnInfinity(value): number {
  const integer = ToInteger(value);
  if (!NumberIsFinite(integer)) {
    throw new RangeError('infinity is out of range');
  }
  return integer;
}

export function ToPositiveInteger(valueParam: unknown, property?: string): number {
  const value = ToInteger(valueParam);
  if (!NumberIsFinite(value)) {
    throw new RangeError('infinity is out of range');
  }
  if (value < 1) {
    if (property !== undefined) {
      throw new RangeError(`property '${property}' cannot be a a number less than one`);
    }
    throw new RangeError('Cannot convert a number less than one to a positive integer');
  }
  return value;
}

function ToIntegerNoFraction(valueParam: unknown): number {
  const value = ToNumber(valueParam);
  if (!IsInteger(value)) {
    throw new RangeError(`unsupported fractional value ${value}`);
  }
  return value;
}
function divmod(x: JSBI,y: JSBI): { quotient: JSBI, remainder: JSBI } {
  const quotient = JSBI.divide(x,y);
  const remainder = JSBI.remainder(x,y);
  return {quotient, remainder};
}

export const ZERO = JSBI.BigInt(0);
export const NEGATIVE_ONE = JSBI.BigInt(-1);

function abs(x: JSBI): JSBI {
  if (JSBI.lessThan(x, ZERO)) return JSBI.multiply(x, NEGATIVE_ONE);
  return x;
}

function bigIntSign(x: JSBI): -1|1|0 {
  if (JSBI.equal(x, ZERO)) return 0;
  if (JSBI.lessThan(x, ZERO)) return -1;
  return 1;
}

const BUILTIN_CASTS = new Map<string, (v: unknown) => number | string>([
  ['year', ToIntegerThrowOnInfinity],
  ['month', ToPositiveInteger],
  ['monthCode', ToString],
  ['day', ToPositiveInteger],
  ['hour', ToIntegerThrowOnInfinity],
  ['minute', ToIntegerThrowOnInfinity],
  ['second', ToIntegerThrowOnInfinity],
  ['millisecond', ToIntegerThrowOnInfinity],
  ['microsecond', ToIntegerThrowOnInfinity],
  ['nanosecond', ToIntegerThrowOnInfinity],
  ['years', ToIntegerNoFraction],
  ['months', ToIntegerNoFraction],
  ['weeks', ToIntegerNoFraction],
  ['days', ToIntegerNoFraction],
  ['hours', ToIntegerNoFraction],
  ['minutes', ToIntegerNoFraction],
  ['seconds', ToIntegerNoFraction],
  ['milliseconds', ToIntegerNoFraction],
  ['microseconds', ToIntegerNoFraction],
  ['nanoseconds', ToIntegerNoFraction],
  ['era', ToString],
  ['eraYear', ToInteger],
  ['offset', ToString]
]);

const ALLOWED_UNITS = [
  'year',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
  'millisecond',
  'microsecond',
  'nanosecond'
] as const;
const SINGULAR_PLURAL_UNITS = [
  ['years', 'year'],
  ['months', 'month'],
  ['weeks', 'week'],
  ['days', 'day'],
  ['hours', 'hour'],
  ['minutes', 'minute'],
  ['seconds', 'second'],
  ['milliseconds', 'millisecond'],
  ['microseconds', 'microsecond'],
  ['nanoseconds', 'nanosecond']
] as const;

import * as PARSE from './regex';

const IntlDateTimeFormatEnUsCache = new Map();

function getIntlDateTimeFormatEnUsForTimeZone(timeZoneIdentifier) {
  let instance = IntlDateTimeFormatEnUsCache.get(timeZoneIdentifier);
  if (instance === undefined) {
    instance = new IntlDateTimeFormat('en-us', {
      timeZone: String(timeZoneIdentifier),
      hour12: false,
      era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    });
    IntlDateTimeFormatEnUsCache.set(timeZoneIdentifier, instance);
  }
  return instance;
}

export function IsTemporalInstant(item: unknown): item is Temporal.Instant {
  return HasSlot(item, EPOCHNANOSECONDS) && !HasSlot(item, TIME_ZONE, CALENDAR);
}

export function IsTemporalTimeZone(item: unknown): item is Temporal.TimeZone {
  return HasSlot(item, TIMEZONE_ID);
}
export function IsTemporalCalendar(item: unknown): item is Temporal.Calendar {
  return HasSlot(item, CALENDAR_ID);
}
export function IsTemporalDuration(item: unknown): item is Temporal.Duration {
  return HasSlot(item, YEARS, MONTHS, DAYS, HOURS, MINUTES, SECONDS, MILLISECONDS, MICROSECONDS, NANOSECONDS);
}
export function IsTemporalDate(item: unknown): item is Temporal.PlainDate {
  return HasSlot(item, DATE_BRAND);
}
export function IsTemporalTime(item: unknown): item is Temporal.PlainTime {
  return (
    HasSlot(item, ISO_HOUR, ISO_MINUTE, ISO_SECOND, ISO_MILLISECOND, ISO_MICROSECOND, ISO_NANOSECOND) &&
    !HasSlot(item, ISO_YEAR, ISO_MONTH, ISO_DAY)
  );
}
export function IsTemporalDateTime(item: unknown): item is Temporal.PlainDateTime {
  return HasSlot(
    item,
    ISO_YEAR,
    ISO_MONTH,
    ISO_DAY,
    ISO_HOUR,
    ISO_MINUTE,
    ISO_SECOND,
    ISO_MILLISECOND,
    ISO_MICROSECOND,
    ISO_NANOSECOND
  );
}
export function IsTemporalYearMonth(item: unknown): item is Temporal.PlainYearMonth {
  return HasSlot(item, YEAR_MONTH_BRAND);
}
export function IsTemporalMonthDay(item: unknown): item is Temporal.PlainMonthDay {
  return HasSlot(item, MONTH_DAY_BRAND);
}
export function IsTemporalZonedDateTime(item: unknown): item is Temporal.ZonedDateTime {
  return HasSlot(item, EPOCHNANOSECONDS, TIME_ZONE, CALENDAR);
}
function TemporalTimeZoneFromString(stringIdent) {
  let { ianaName, offset, z } = ParseTemporalTimeZoneString(stringIdent);
  let identifier = ianaName;
  if (!identifier && z) identifier = 'UTC';
  if (!identifier) identifier = offset;
  const result = GetCanonicalTimeZoneIdentifier(identifier);
  if (offset && identifier !== offset) {
    const ns = ParseTemporalInstant(stringIdent);
    const offsetNs = GetIANATimeZoneOffsetNanoseconds(ns, result);
    if (FormatTimeZoneOffsetString(offsetNs) !== offset) {
      throw new RangeError(`invalid offset ${offset}[${ianaName}]`);
    }
  }
  return result;
}

function FormatCalendarAnnotation(id, showCalendar) {
  if (showCalendar === 'never') return '';
  if (showCalendar === 'auto' && id === 'iso8601') return '';
  return `[u-ca=${id}]`;
}

function ParseISODateTime(isoString, { zoneRequired }) {
  const regex = zoneRequired ? PARSE.instant : PARSE.datetime;
  const match = regex.exec(isoString);
  if (!match) throw new RangeError(`invalid ISO 8601 string: ${isoString}`);
  let yearString = match[1];
  if (yearString[0] === '\u2212') yearString = `-${yearString.slice(1)}`;
  const year = ToInteger(yearString);
  const month = ToInteger(match[2] || match[4]);
  const day = ToInteger(match[3] || match[5]);
  const hour = ToInteger(match[6]);
  const minute = ToInteger(match[7] || match[10]);
  let second = ToInteger(match[8] || match[11]);
  if (second === 60) second = 59;
  const fraction = (match[9] || match[12]) + '000000000';
  const millisecond = ToInteger(fraction.slice(0, 3));
  const microsecond = ToInteger(fraction.slice(3, 6));
  const nanosecond = ToInteger(fraction.slice(6, 9));
  let offset;
  let z = false;
  if (match[13]) {
    offset = undefined;
    z = true;
  } else if (match[14] && match[15]) {
    const offsetSign = match[14] === '-' || match[14] === '\u2212' ? '-' : '+';
    const offsetHours = match[15] || '00';
    const offsetMinutes = match[16] || '00';
    const offsetSeconds = match[17] || '00';
    let offsetFraction = match[18] || '0';
    offset = `${offsetSign}${offsetHours}:${offsetMinutes}`;
    if (+offsetFraction) {
      while (offsetFraction.endsWith('0')) offsetFraction = offsetFraction.slice(0, -1);
      offset += `:${offsetSeconds}.${offsetFraction}`;
    } else if (+offsetSeconds) {
      offset += `:${offsetSeconds}`;
    }
    if (offset === '-00:00') offset = '+00:00';
  }
  let ianaName = match[19];
  if (ianaName) {
    try {
      // Canonicalize name if it is an IANA link name or is capitalized wrong
      ianaName = GetCanonicalTimeZoneIdentifier(ianaName).toString();
    } catch {
      // Not an IANA name, may be a custom ID, pass through unchanged
    }
  }
  const calendar = match[20];
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond,
    ianaName,
    offset,
    z,
    calendar
  };
}

function ParseTemporalInstantString(isoString) {
  return ParseISODateTime(isoString, { zoneRequired: true });
}

function ParseTemporalZonedDateTimeString(isoString) {
  return ParseISODateTime(isoString, { zoneRequired: true });
}

function ParseTemporalDateTimeString(isoString) {
  return ParseISODateTime(isoString, { zoneRequired: false });
}

function ParseTemporalDateString(isoString) {
  return ParseISODateTime(isoString, { zoneRequired: false });
}

function ParseTemporalTimeString(isoString) {
  const match = PARSE.time.exec(isoString);
  let hour, minute, second, millisecond, microsecond, nanosecond, calendar;
  if (match) {
    hour = ToInteger(match[1]);
    minute = ToInteger(match[2] || match[5]);
    second = ToInteger(match[3] || match[6]);
    if (second === 60) second = 59;
    const fraction = (match[4] || match[7]) + '000000000';
    millisecond = ToInteger(fraction.slice(0, 3));
    microsecond = ToInteger(fraction.slice(3, 6));
    nanosecond = ToInteger(fraction.slice(6, 9));
    calendar = match[15];
  } else {
    ({ hour, minute, second, millisecond, microsecond, nanosecond, calendar } = ParseISODateTime(isoString, {
      zoneRequired: false
    }));
  }
  return { hour, minute, second, millisecond, microsecond, nanosecond, calendar };
}

function ParseTemporalYearMonthString(isoString) {
  const match = PARSE.yearmonth.exec(isoString);
  let year, month, calendar, referenceISODay;
  if (match) {
    let yearString = match[1];
    if (yearString[0] === '\u2212') yearString = `-${yearString.slice(1)}`;
    year = ToInteger(yearString);
    month = ToInteger(match[2]);
    calendar = match[3];
  } else {
    ({ year, month, calendar, day: referenceISODay } = ParseISODateTime(isoString, { zoneRequired: false }));
  }
  return { year, month, calendar, referenceISODay };
}

function ParseTemporalMonthDayString(isoString) {
  const match = PARSE.monthday.exec(isoString);
  let month, day, calendar, referenceISOYear;
  if (match) {
    month = ToInteger(match[1]);
    day = ToInteger(match[2]);
  } else {
    ({ month, day, calendar, year: referenceISOYear } = ParseISODateTime(isoString, { zoneRequired: false }));
  }
  return { month, day, calendar, referenceISOYear };
}

function ParseTemporalTimeZoneString(stringIdent): {
  ianaName?: string | undefined;
  offset?: string | undefined;
  z?: boolean | undefined;
} {
  try {
    let canonicalIdent = GetCanonicalTimeZoneIdentifier(stringIdent);
    if (canonicalIdent) {
      canonicalIdent = canonicalIdent.toString();
      if (ParseOffsetString(canonicalIdent) !== null) return { offset: canonicalIdent };
      return { ianaName: canonicalIdent };
    }
  } catch {
    // fall through
  }
  try {
    // Try parsing ISO string instead
    return ParseISODateTime(stringIdent, { zoneRequired: true });
  } catch {
    throw new RangeError(`Invalid time zone: ${stringIdent}`);
  }
}

function ParseTemporalDurationString(isoString) {
  const match = PARSE.duration.exec(isoString);
  if (!match) throw new RangeError(`invalid duration: ${isoString}`);
  if (match.slice(2).every((element) => element === undefined)) {
    throw new RangeError(`invalid duration: ${isoString}`);
  }
  const sign = match[1] === '-' || match[1] === '\u2212' ? -1 : 1;
  const years = ToInteger(match[2]) * sign;
  const months = ToInteger(match[3]) * sign;
  const weeks = ToInteger(match[4]) * sign;
  const days = ToInteger(match[5]) * sign;
  const hours = ToInteger(match[6]) * sign;
  let fHours: number | string = match[7];
  let minutes = ToInteger(match[8]) * sign;
  let fMinutes: number | string = match[9];
  let seconds = ToInteger(match[10]) * sign;
  const fSeconds = match[11] + '000000000';
  let milliseconds = ToInteger(fSeconds.slice(0, 3)) * sign;
  let microseconds = ToInteger(fSeconds.slice(3, 6)) * sign;
  let nanoseconds = ToInteger(fSeconds.slice(6, 9)) * sign;

  fHours = fHours ? (sign * ToInteger(fHours)) / 10 ** fHours.length : 0;
  fMinutes = fMinutes ? (sign * ToInteger(fMinutes)) / 10 ** fMinutes.length : 0;

  ({ minutes, seconds, milliseconds, microseconds, nanoseconds } = DurationHandleFractions(
    fHours,
    minutes,
    fMinutes,
    seconds,
    milliseconds,
    microseconds,
    nanoseconds
  ));
  return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
}

function ParseTemporalInstant(isoString) {
  const { year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, offset, z } =
    ParseTemporalInstantString(isoString);

  const epochNs = GetEpochFromISOParts(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
  if (epochNs === null) throw new RangeError('DateTime outside of supported range');
  if (!z && !offset) throw new RangeError('Temporal.Instant requires a time zone offset');
  const offsetNs = z ? 0 : ParseOffsetString(offset);
  return JSBI.subtract(epochNs, JSBI.BigInt(offsetNs));
}

export function RegulateISODate(year, month, day, overflow) {
  switch (overflow) {
    case 'reject':
      RejectISODate(year, month, day);
      break;
    case 'constrain':
      ({ year, month, day } = ConstrainISODate(year, month, day));
      break;
  }
  return { year, month, day };
}

export function RegulateTime(hour, minute, second, millisecond, microsecond, nanosecond, overflow) {
  switch (overflow) {
    case 'reject':
      RejectTime(hour, minute, second, millisecond, microsecond, nanosecond);
      break;
    case 'constrain':
      ({ hour, minute, second, millisecond, microsecond, nanosecond } = ConstrainTime(
        hour,
        minute,
        second,
        millisecond,
        microsecond,
        nanosecond
      ));
      break;
  }
  return { hour, minute, second, millisecond, microsecond, nanosecond };
}

export function RegulateISOYearMonth(year, month, overflow) {
  const referenceISODay = 1;
  switch (overflow) {
    case 'reject':
      RejectISODate(year, month, referenceISODay);
      break;
    case 'constrain':
      ({ year, month } = ConstrainISODate(year, month));
      break;
  }
  return { year, month };
}

function DurationHandleFractions(fHours, minutes, fMinutes, seconds, milliseconds, microseconds, nanoseconds) {
  if (fHours !== 0) {
    [minutes, fMinutes, seconds, milliseconds, microseconds, nanoseconds].forEach((val) => {
      if (val !== 0) throw new RangeError('only the smallest unit can be fractional');
    });
    const mins = fHours * 60;
    minutes = MathTrunc(mins);
    fMinutes = mins % 1;
  }

  if (fMinutes !== 0) {
    [seconds, milliseconds, microseconds, nanoseconds].forEach((val) => {
      if (val !== 0) throw new RangeError('only the smallest unit can be fractional');
    });
    const secs = fMinutes * 60;
    seconds = MathTrunc(secs);
    const fSeconds = secs % 1;

    if (fSeconds !== 0) {
      const mils = fSeconds * 1000;
      milliseconds = MathTrunc(mils);
      const fMilliseconds = mils % 1;

      if (fMilliseconds !== 0) {
        const mics = fMilliseconds * 1000;
        microseconds = MathTrunc(mics);
        const fMicroseconds = mics % 1;

        if (fMicroseconds !== 0) {
          const nans = fMicroseconds * 1000;
          nanoseconds = MathTrunc(nans);
        }
      }
    }
  }

  return { minutes, seconds, milliseconds, microseconds, nanoseconds };
}

function ToTemporalDurationRecord(item) {
  if (IsTemporalDuration(item)) {
    return {
      years: GetSlot(item, YEARS),
      months: GetSlot(item, MONTHS),
      weeks: GetSlot(item, WEEKS),
      days: GetSlot(item, DAYS),
      hours: GetSlot(item, HOURS),
      minutes: GetSlot(item, MINUTES),
      seconds: GetSlot(item, SECONDS),
      milliseconds: GetSlot(item, MILLISECONDS),
      microseconds: GetSlot(item, MICROSECONDS),
      nanoseconds: GetSlot(item, NANOSECONDS)
    };
  }
  const props = ToPartialRecord(item, [
    'days',
    'hours',
    'microseconds',
    'milliseconds',
    'minutes',
    'months',
    'nanoseconds',
    'seconds',
    'weeks',
    'years'
  ]);
  if (!props) throw new TypeError('invalid duration-like');
  const {
    years = 0,
    months = 0,
    weeks = 0,
    days = 0,
    hours = 0,
    minutes = 0,
    seconds = 0,
    milliseconds = 0,
    microseconds = 0,
    nanoseconds = 0
  } = props;
  return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
}

export function ToLimitedTemporalDuration(item, disallowedProperties = []) {
  let record;
  if (IsObject(item)) {
    record = ToTemporalDurationRecord(item);
  } else {
    const str = ToString(item);
    record = ParseTemporalDurationString(str);
  }
  const { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = record;
  RejectDuration(years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds);
  for (const property of disallowedProperties) {
    if (record[property] !== 0) {
      throw new RangeError(
        `Duration field ${property} not supported by Temporal.Instant. Try Temporal.ZonedDateTime instead.`
      );
    }
  }
  return record;
}

export function ToTemporalOverflow(options) {
  return GetOption(options, 'overflow', ['constrain', 'reject'], 'constrain');
}

export function ToTemporalDisambiguation(options) {
  return GetOption(options, 'disambiguation', ['compatible', 'earlier', 'later', 'reject'], 'compatible');
}

export function ToTemporalRoundingMode(options, fallback) {
  return GetOption(options, 'roundingMode', ['ceil', 'floor', 'trunc', 'halfExpand'], fallback);
}

export function NegateTemporalRoundingMode(roundingMode) {
  switch (roundingMode) {
    case 'ceil':
      return 'floor';
    case 'floor':
      return 'ceil';
    default:
      return roundingMode;
  }
}

export function ToTemporalOffset(options, fallback) {
  return GetOption(options, 'offset', ['prefer', 'use', 'ignore', 'reject'], fallback);
}

export function ToShowCalendarOption(options) {
  return GetOption(options, 'calendarName', ['auto', 'always', 'never'], 'auto');
}

export function ToShowTimeZoneNameOption(options) {
  return GetOption(options, 'timeZoneName', ['auto', 'never'], 'auto');
}

export function ToShowOffsetOption(options) {
  return GetOption(options, 'offset', ['auto', 'never'], 'auto');
}

export function ToTemporalRoundingIncrement(options, dividend, inclusive) {
  let maximum = Infinity;
  if (dividend !== undefined) maximum = dividend;
  if (!inclusive && dividend !== undefined) maximum = dividend > 1 ? dividend - 1 : 1;
  const increment = GetNumberOption(options, 'roundingIncrement', 1, maximum, 1);
  if (dividend !== undefined && dividend % increment !== 0) {
    throw new RangeError(`Rounding increment must divide evenly into ${dividend}`);
  }
  return increment;
}

export function ToTemporalDateTimeRoundingIncrement(options, smallestUnit) {
  const maximumIncrements = {
    year: undefined,
    month: undefined,
    week: undefined,
    day: undefined,
    hour: 24,
    minute: 60,
    second: 60,
    millisecond: 1000,
    microsecond: 1000,
    nanosecond: 1000
  };
  return ToTemporalRoundingIncrement(options, maximumIncrements[smallestUnit], false);
}

type SecondsStringPrecisionOptions = {
  precision?: Temporal.ToStringPrecisionOptions['fractionalSecondDigits'] | 'minute';
  unit: 'minute'|'second'|'millisecond'|'microsecond'|'nanosecond';
  increment: number;
};

export function ToSecondsStringPrecision(options: Temporal.ToStringPrecisionOptions): SecondsStringPrecisionOptions {
  const smallestUnit = ToSmallestTemporalUnit(options, undefined, ['year', 'month', 'week', 'day', 'hour']);
  switch (smallestUnit) {
    case 'minute':
      return { precision: 'minute', unit: 'minute', increment: 1 };
    case 'second':
      return { precision: 0, unit: 'second', increment: 1 };
    case 'millisecond':
      return { precision: 3, unit: 'millisecond', increment: 1 };
    case 'microsecond':
      return { precision: 6, unit: 'microsecond', increment: 1 };
    case 'nanosecond':
      return { precision: 9, unit: 'nanosecond', increment: 1 };
    default: // fall through if option not given
  }
  let digits = options.fractionalSecondDigits;
  if (digits === undefined) digits = 'auto';
  if (typeof digits !== 'number') {
    const digitsStr = ToString(digits);
    if (digitsStr === 'auto') return { precision: 'auto', unit: 'nanosecond', increment: 1 };
    throw new RangeError(`fractionalSecondDigits must be 'auto' or 0 through 9, not ${digits}`);
  }
  if (NumberIsNaN(digits) || digits < 0 || digits > 9) {
    throw new RangeError(`fractionalSecondDigits must be 'auto' or 0 through 9, not ${digits}`);
  }
  const precision = MathFloor(digits);
  switch (precision) {
    case 0:
      return { precision, unit: 'second', increment: 1 };
    case 1:
    case 2:
    case 3:
      return { precision, unit: 'millisecond', increment: 10 ** (3 - precision) };
    case 4:
    case 5:
    case 6:
      return { precision, unit: 'microsecond', increment: 10 ** (6 - precision) };
    case 7:
    case 8:
    case 9:
      return { precision, unit: 'nanosecond', increment: 10 ** (9 - precision) };
    default:
      throw new RangeError(`fractionalSecondDigits must be 'auto' or 0 through 9, not ${digits}`);
  }
}

type AllowedUnit = typeof ALLOWED_UNITS[number];

export function ToLargestTemporalUnit(options: {largestUnit?: unknown}, fallback, disallowedStrings: readonly AllowedUnit[] = [], autoValue?: AllowedUnit): AllowedUnit {
  const singular = new Map(SINGULAR_PLURAL_UNITS.filter(([, sing]) => !disallowedStrings.includes(sing)));
  const allowed = new Set(ALLOWED_UNITS);
  for (const s of disallowedStrings) {
    allowed.delete(s);
  }
  const retval = GetOption(options, 'largestUnit', ['auto', ...allowed, ...singular.keys()], fallback);
  if (retval === 'auto' && autoValue !== undefined) return autoValue;
  if (singular.has(retval)) return singular.get(retval);
  return retval;
}

export function ToSmallestTemporalUnit(options: {smallestUnit?: unknown}, fallback: AllowedUnit, disallowedStrings: readonly AllowedUnit[] = []): Exclude<AllowedUnit, keyof typeof disallowedStrings[number]> {
  const singular = new Map(SINGULAR_PLURAL_UNITS.filter(([, sing]) => !disallowedStrings.includes(sing)));
  const allowed = new Set(ALLOWED_UNITS);
  for (const s of disallowedStrings) {
    allowed.delete(s);
  }
  const value = GetOption(options, 'smallestUnit', [...allowed, ...singular.keys()], fallback);
  // This logic in theory should narrow the resulting value, with plural values
  // being transformed to the not-deprecated singular value.
  // Alas, TypeScript can't follow this logic as it can't type-narrow away all
  // the plural keys, and doesn't widen the `singular` map's `has` method to
  // accept anything.
  if (singular.has(value as any)) return singular.get(value as any);
  return value as any;
}

export function ToTemporalDurationTotalUnit(options) {
  // This AO is identical to ToSmallestTemporalUnit, except:
  // - default is always `undefined` (caller will throw if omitted)
  // - option is named `unit` (not `smallestUnit`)
  // - all units are valid (no `disallowedStrings`)
  const singular = new Map(SINGULAR_PLURAL_UNITS);
  const allowedValues = [...singular.values(), ...singular.keys()] as const;
  const value = GetOption(options, 'unit', allowedValues);
  if (singular.has(value as any)) return singular.get(value as any);
  return value;
}

export function ToRelativeTemporalObject(options): Temporal.DurationCompareOptions['relativeTo'] {
  const relativeTo = options.relativeTo;
  if (relativeTo === undefined) return relativeTo;

  let offsetBehaviour = 'option';
  let year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar, timeZone, offset;
  if (IsObject(relativeTo)) {
    if (IsTemporalZonedDateTime(relativeTo) || IsTemporalDateTime(relativeTo)) return relativeTo;
    if (IsTemporalDate(relativeTo)) {
      return CreateTemporalDateTime(
        GetSlot(relativeTo, ISO_YEAR),
        GetSlot(relativeTo, ISO_MONTH),
        GetSlot(relativeTo, ISO_DAY),
        0,
        0,
        0,
        0,
        0,
        0,
        GetSlot(relativeTo, CALENDAR)
      );
    }
    calendar = GetTemporalCalendarWithISODefault(relativeTo);
    const fieldNames = CalendarFields(calendar, ['day', 'month', 'monthCode', 'year']);
    const fields = ToTemporalDateTimeFields(relativeTo, fieldNames);
    const dateOptions = ObjectCreate(null);
    dateOptions.overflow = 'constrain';
    ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond } = InterpretTemporalDateTimeFields(
      calendar,
      fields,
      dateOptions
    ));
    offset = relativeTo.offset;
    if (offset === undefined) offsetBehaviour = 'wall';
    timeZone = relativeTo.timeZone;
  } else {
    let ianaName, z;
    ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar, ianaName, offset, z } =
      ParseISODateTime(ToString(relativeTo), { zoneRequired: false }));
    if (ianaName) timeZone = ianaName;
    if (z) {
      offsetBehaviour = 'exact';
    } else if (!offset) {
      offsetBehaviour = 'wall';
    }
    if (!calendar) calendar = GetISO8601Calendar();
    calendar = ToTemporalCalendar(calendar);
  }
  if (timeZone) {
    timeZone = ToTemporalTimeZone(timeZone);
    let offsetNs = 0;
    if (offsetBehaviour === 'option') offsetNs = ParseOffsetString(ToString(offset));
    const epochNanoseconds = InterpretISODateTimeOffset(
      year,
      month,
      day,
      hour,
      minute,
      second,
      millisecond,
      microsecond,
      nanosecond,
      offsetBehaviour,
      offsetNs,
      timeZone,
      'compatible',
      'reject'
    );
    return CreateTemporalZonedDateTime(epochNanoseconds, timeZone, calendar);
  }
  return CreateTemporalDateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar);
}

export function ValidateTemporalUnitRange(largestUnit, smallestUnit) {
  if (ALLOWED_UNITS.indexOf(largestUnit) > ALLOWED_UNITS.indexOf(smallestUnit)) {
    throw new RangeError(`largestUnit ${largestUnit} cannot be smaller than smallestUnit ${smallestUnit}`);
  }
}

export function DefaultTemporalLargestUnit(
  years,
  months,
  weeks,
  days,
  hours,
  minutes,
  seconds,
  milliseconds,
  microseconds,
  nanoseconds
) {
  const singular = new Map(SINGULAR_PLURAL_UNITS);
  for (const [prop, v] of [
    ['years', years],
    ['months', months],
    ['weeks', weeks],
    ['days', days],
    ['hours', hours],
    ['minutes', minutes],
    ['seconds', seconds],
    ['milliseconds', milliseconds],
    ['microseconds', microseconds],
    ['nanoseconds', nanoseconds]
  ]) {
    if (v !== 0) return singular.get(prop);
  }
  return 'nanosecond';
}

export function LargerOfTwoTemporalUnits(unit1, unit2) {
  if (ALLOWED_UNITS.indexOf(unit1) > ALLOWED_UNITS.indexOf(unit2)) return unit2;
  return unit1;
}

export function ToPartialRecord(bag, fields, callerCast?: (value: unknown) => unknown) {
  if (!IsObject(bag)) return false;
  let any;
  for (const property of fields) {
    const value = bag[property];
    if (value !== undefined) {
      any = any || {};
      if (callerCast === undefined && BUILTIN_CASTS.has(property)) {
        any[property] = BUILTIN_CASTS.get(property)(value);
      } else if (callerCast !== undefined) {
        any[property] = callerCast(value);
      } else {
        any[property] = value;
      }
    }
  }
  return any ? any : false;
}

export function PrepareTemporalFields(bag, fields) {
  if (!IsObject(bag)) return undefined;
  const result = {};
  let any = false;
  for (const fieldRecord of fields) {
    const [property, defaultValue] = fieldRecord;
    let value = bag[property];
    if (value === undefined) {
      if (fieldRecord.length === 1) {
        throw new TypeError(`required property '${property}' missing or undefined`);
      }
      value = defaultValue;
    } else {
      any = true;
      if (BUILTIN_CASTS.has(property)) {
        value = BUILTIN_CASTS.get(property)(value);
      }
    }
    result[property] = value;
  }
  if (!any) {
    throw new TypeError('no supported properties found');
  }
  if ((result['era'] === undefined) !== (result['eraYear'] === undefined)) {
    throw new RangeError("properties 'era' and 'eraYear' must be provided together");
  }
  return result;
}

// field access in the following operations is intentionally alphabetical
export function ToTemporalDateFields(bag, fieldNames) {
  const entries = [
    ['day', undefined],
    ['month', undefined],
    ['monthCode', undefined],
    ['year', undefined]
  ];
  // Add extra fields from the calendar at the end
  fieldNames.forEach((fieldName) => {
    if (!entries.some(([name]) => name === fieldName)) {
      entries.push([fieldName, undefined]);
    }
  });
  return PrepareTemporalFields(bag, entries);
}

export function ToTemporalDateTimeFields(bag, fieldNames) {
  const entries = [
    ['day', undefined],
    ['hour', 0],
    ['microsecond', 0],
    ['millisecond', 0],
    ['minute', 0],
    ['month', undefined],
    ['monthCode', undefined],
    ['nanosecond', 0],
    ['second', 0],
    ['year', undefined]
  ];
  // Add extra fields from the calendar at the end
  fieldNames.forEach((fieldName) => {
    if (!entries.some(([name]) => name === fieldName)) {
      entries.push([fieldName, undefined]);
    }
  });
  return PrepareTemporalFields(bag, entries);
}

export function ToTemporalMonthDayFields(bag, fieldNames) {
  const entries = [
    ['day', undefined],
    ['month', undefined],
    ['monthCode', undefined],
    ['year', undefined]
  ];
  // Add extra fields from the calendar at the end
  fieldNames.forEach((fieldName) => {
    if (!entries.some(([name]) => name === fieldName)) {
      entries.push([fieldName, undefined]);
    }
  });
  return PrepareTemporalFields(bag, entries);
}

export function ToTemporalTimeRecord(bag) {
  return PrepareTemporalFields(bag, [
    ['hour', 0],
    ['microsecond', 0],
    ['millisecond', 0],
    ['minute', 0],
    ['nanosecond', 0],
    ['second', 0]
  ]);
}

export function ToTemporalYearMonthFields(bag, fieldNames) {
  const entries = [
    ['month', undefined],
    ['monthCode', undefined],
    ['year', undefined]
  ];
  // Add extra fields from the calendar at the end
  fieldNames.forEach((fieldName) => {
    if (!entries.some(([name]) => name === fieldName)) {
      entries.push([fieldName, undefined]);
    }
  });
  return PrepareTemporalFields(bag, entries);
}

export function ToTemporalZonedDateTimeFields(bag, fieldNames) {
  const entries = [
    ['day', undefined],
    ['hour', 0],
    ['microsecond', 0],
    ['millisecond', 0],
    ['minute', 0],
    ['month', undefined],
    ['monthCode', undefined],
    ['nanosecond', 0],
    ['second', 0],
    ['year', undefined],
    ['offset', undefined],
    ['timeZone']
  ];
  // Add extra fields from the calendar at the end
  fieldNames.forEach((fieldName) => {
    if (!entries.some(([name]) => name === fieldName)) {
      entries.push([fieldName, undefined]);
    }
  });
  return PrepareTemporalFields(bag, entries);
}

export function ToTemporalDate(item, options = ObjectCreate(null)) {
  if (IsObject(item)) {
    if (IsTemporalDate(item)) return item;
    if (IsTemporalZonedDateTime(item)) {
      item = BuiltinTimeZoneGetPlainDateTimeFor(
        GetSlot(item, TIME_ZONE),
        GetSlot(item, INSTANT),
        GetSlot(item, CALENDAR)
      );
    }
    if (IsTemporalDateTime(item)) {
      return CreateTemporalDate(
        GetSlot(item, ISO_YEAR),
        GetSlot(item, ISO_MONTH),
        GetSlot(item, ISO_DAY),
        GetSlot(item, CALENDAR)
      );
    }
    const calendar = GetTemporalCalendarWithISODefault(item);
    const fieldNames = CalendarFields(calendar, ['day', 'month', 'monthCode', 'year']);
    const fields = ToTemporalDateFields(item, fieldNames);
    return DateFromFields(calendar, fields, options);
  }
  ToTemporalOverflow(options); // validate and ignore
  const { year, month, day, calendar } = ParseTemporalDateString(ToString(item));
  const TemporalPlainDate = GetIntrinsic('%Temporal.PlainDate%');
  return new TemporalPlainDate(year, month, day, calendar); // include validation
}

export function InterpretTemporalDateTimeFields(calendar, fields, options) {
  let { hour, minute, second, millisecond, microsecond, nanosecond } = ToTemporalTimeRecord(fields) as any;
  const overflow = ToTemporalOverflow(options);
  const date = DateFromFields(calendar, fields, options);
  const year = GetSlot(date, ISO_YEAR);
  const month = GetSlot(date, ISO_MONTH);
  const day = GetSlot(date, ISO_DAY);
  ({ hour, minute, second, millisecond, microsecond, nanosecond } = RegulateTime(
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond,
    overflow
  ));
  return { year, month, day, hour, minute, second, millisecond, microsecond, nanosecond };
}

export function ToTemporalDateTime(item, options = ObjectCreate(null)): Temporal.PlainDateTime {
  let year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar;
  if (IsObject(item)) {
    if (IsTemporalDateTime(item)) return item;
    if (IsTemporalZonedDateTime(item)) {
      return BuiltinTimeZoneGetPlainDateTimeFor(
        GetSlot(item, TIME_ZONE),
        GetSlot(item, INSTANT),
        GetSlot(item, CALENDAR)
      );
    }
    if (IsTemporalDate(item)) {
      return CreateTemporalDateTime(
        GetSlot(item, ISO_YEAR),
        GetSlot(item, ISO_MONTH),
        GetSlot(item, ISO_DAY),
        0,
        0,
        0,
        0,
        0,
        0,
        GetSlot(item, CALENDAR)
      );
    }

    calendar = GetTemporalCalendarWithISODefault(item);
    const fieldNames = CalendarFields(calendar, [
      'day',
      'hour',
      'microsecond',
      'millisecond',
      'minute',
      'month',
      'monthCode',
      'nanosecond',
      'second',
      'year'
    ]);
    const fields = ToTemporalDateTimeFields(item, fieldNames);
    ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond } = InterpretTemporalDateTimeFields(
      calendar,
      fields,
      options
    ));
  } else {
    ToTemporalOverflow(options); // validate and ignore
    ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar } =
      ParseTemporalDateTimeString(ToString(item)));
    RejectDateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
    if (calendar === undefined) calendar = GetISO8601Calendar();
    calendar = ToTemporalCalendar(calendar);
  }
  return CreateTemporalDateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar);
}

export function ToTemporalDuration(item) {
  let years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds;
  if (IsObject(item)) {
    if (IsTemporalDuration(item)) return item;
    ({ years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } =
      ToTemporalDurationRecord(item));
  } else {
    ({ years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } =
      ParseTemporalDurationString(ToString(item)));
  }
  const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
  return new TemporalDuration(
    years,
    months,
    weeks,
    days,
    hours,
    minutes,
    seconds,
    milliseconds,
    microseconds,
    nanoseconds
  );
}

export function ToTemporalInstant(item) {
  if (IsTemporalInstant(item)) return item;
  if (IsTemporalZonedDateTime(item)) {
    const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
    return new TemporalInstant(GetSlot(item, EPOCHNANOSECONDS));
  }
  const ns = ParseTemporalInstant(ToString(item));
  const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
  return new TemporalInstant(ns);
}

export function ToTemporalMonthDay(item, options = ObjectCreate(null)) {
  if (IsObject(item)) {
    if (IsTemporalMonthDay(item)) return item;
    let calendar, calendarAbsent;
    if (HasSlot(item, CALENDAR)) {
      calendar = GetSlot(item, CALENDAR);
      calendarAbsent = false;
    } else {
      calendar = item.calendar;
      calendarAbsent = calendar === undefined;
      if (calendar === undefined) calendar = GetISO8601Calendar();
      calendar = ToTemporalCalendar(calendar);
    }
    const fieldNames = CalendarFields(calendar, ['day', 'month', 'monthCode', 'year']);
    const fields = ToTemporalMonthDayFields(item, fieldNames) as any;
    // Callers who omit the calendar are not writing calendar-independent
    // code. In that case, `monthCode`/`year` can be omitted; `month` and
    // `day` are sufficient. Add a `year` to satisfy calendar validation.
    if (calendarAbsent && fields.month !== undefined && fields.monthCode === undefined && fields.year === undefined) {
      fields.year = 1972;
    }
    return MonthDayFromFields(calendar, fields, options);
  }

  ToTemporalOverflow(options); // validate and ignore
  let { month, day, referenceISOYear, calendar } = ParseTemporalMonthDayString(ToString(item));
  if (calendar === undefined) calendar = GetISO8601Calendar();
  calendar = ToTemporalCalendar(calendar);

  if (referenceISOYear === undefined) {
    RejectISODate(1972, month, day);
    return CreateTemporalMonthDay(month, day, calendar);
  }
  const result = CreateTemporalMonthDay(month, day, calendar, referenceISOYear);
  const canonicalOptions = ObjectCreate(null);
  return MonthDayFromFields(calendar, result, canonicalOptions);
}

export function ToTemporalTime(item, overflow = 'constrain') {
  let hour, minute, second, millisecond, microsecond, nanosecond, calendar;
  if (IsObject(item)) {
    if (IsTemporalTime(item)) return item;
    if (IsTemporalZonedDateTime(item)) {
      item = BuiltinTimeZoneGetPlainDateTimeFor(
        GetSlot(item, TIME_ZONE),
        GetSlot(item, INSTANT),
        GetSlot(item, CALENDAR)
      );
    }
    if (IsTemporalDateTime(item)) {
      const TemporalPlainTime = GetIntrinsic('%Temporal.PlainTime%');
      return new TemporalPlainTime(
        GetSlot(item, ISO_HOUR),
        GetSlot(item, ISO_MINUTE),
        GetSlot(item, ISO_SECOND),
        GetSlot(item, ISO_MILLISECOND),
        GetSlot(item, ISO_MICROSECOND),
        GetSlot(item, ISO_NANOSECOND)
      );
    }
    calendar = GetTemporalCalendarWithISODefault(item);
    if (ToString(calendar) !== 'iso8601') {
      throw new RangeError('PlainTime can only have iso8601 calendar');
    }
    ({ hour, minute, second, millisecond, microsecond, nanosecond } = ToTemporalTimeRecord(item) as any);
    ({ hour, minute, second, millisecond, microsecond, nanosecond } = RegulateTime(
      hour,
      minute,
      second,
      millisecond,
      microsecond,
      nanosecond,
      overflow
    ));
  } else {
    ({ hour, minute, second, millisecond, microsecond, nanosecond, calendar } = ParseTemporalTimeString(
      ToString(item)
    ));
    RejectTime(hour, minute, second, millisecond, microsecond, nanosecond);
    if (calendar !== undefined && calendar !== 'iso8601') {
      throw new RangeError('PlainTime can only have iso8601 calendar');
    }
  }
  const TemporalPlainTime = GetIntrinsic('%Temporal.PlainTime%');
  return new TemporalPlainTime(hour, minute, second, millisecond, microsecond, nanosecond);
}

export function ToTemporalYearMonth(item, options = ObjectCreate(null)) {
  if (IsObject(item)) {
    if (IsTemporalYearMonth(item)) return item;
    const calendar = GetTemporalCalendarWithISODefault(item);
    const fieldNames = CalendarFields(calendar, ['month', 'monthCode', 'year']);
    const fields = ToTemporalYearMonthFields(item, fieldNames);
    return YearMonthFromFields(calendar, fields, options);
  }

  ToTemporalOverflow(options); // validate and ignore
  let { year, month, referenceISODay, calendar } = ParseTemporalYearMonthString(ToString(item));
  if (calendar === undefined) calendar = GetISO8601Calendar();
  calendar = ToTemporalCalendar(calendar);

  if (referenceISODay === undefined) {
    RejectISODate(year, month, 1);
    return CreateTemporalYearMonth(year, month, calendar);
  }
  const result = CreateTemporalYearMonth(year, month, calendar, referenceISODay);
  const canonicalOptions = ObjectCreate(null);
  return YearMonthFromFields(calendar, result, canonicalOptions);
}

export function InterpretISODateTimeOffset(
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
  microsecond,
  nanosecond,
  offsetBehaviour,
  offsetNs,
  timeZone,
  disambiguation,
  offsetOpt
) {
  const DateTime = GetIntrinsic('%Temporal.PlainDateTime%');
  const dt = new DateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);

  if (offsetBehaviour === 'wall' || offsetOpt === 'ignore') {
    // Simple case: ISO string without a TZ offset (or caller wants to ignore
    // the offset), so just convert DateTime to Instant in the given time zone
    const instant = BuiltinTimeZoneGetInstantFor(timeZone, dt, disambiguation);
    return GetSlot(instant, EPOCHNANOSECONDS);
  }

  // The caller wants the offset to always win ('use') OR the caller is OK
  // with the offset winning ('prefer' or 'reject') as long as it's valid
  // for this timezone and date/time.
  if (offsetBehaviour === 'exact' || offsetOpt === 'use') {
    // Calculate the instant for the input's date/time and offset
    const epochNs = GetEpochFromISOParts(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
    if (epochNs === null) throw new RangeError('ZonedDateTime outside of supported range');
    return JSBI.subtract(epochNs, JSBI.BigInt(offsetNs));
  }

  // "prefer" or "reject"
  const possibleInstants = GetPossibleInstantsFor(timeZone, dt);
  for (const candidate of possibleInstants) {
    const candidateOffset = GetOffsetNanosecondsFor(timeZone, candidate);
    if (candidateOffset === offsetNs) return GetSlot(candidate, EPOCHNANOSECONDS);
  }

  // the user-provided offset doesn't match any instants for this time
  // zone and date/time.
  if (offsetOpt === 'reject') {
    const offsetStr = FormatTimeZoneOffsetString(offsetNs);
    const timeZoneString = IsTemporalTimeZone(timeZone) ? GetSlot(timeZone, TIMEZONE_ID) : 'time zone';
    // The tsc emit for this line rewrites to invoke the PlainDateTime's valueOf method, NOT
    // toString (which is invoked by Node when using template literals directly).
    // See https://github.com/microsoft/TypeScript/issues/39744 for the proposed fix in tsc emit
    throw new RangeError(`Offset ${offsetStr} is invalid for ${dt.toString()} in ${timeZoneString}`);
  }
  // fall through: offsetOpt === 'prefer', but the offset doesn't match
  // so fall back to use the time zone instead.
  const instant = DisambiguatePossibleInstants(possibleInstants, timeZone, dt, disambiguation);
  return GetSlot(instant, EPOCHNANOSECONDS);
}

export function ToTemporalZonedDateTime(item, options = ObjectCreate(null)) {
  let year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, timeZone, offset, calendar;
  let offsetBehaviour = 'option';
  if (IsObject(item)) {
    if (IsTemporalZonedDateTime(item)) return item;
    calendar = GetTemporalCalendarWithISODefault(item);
    const fieldNames = CalendarFields(calendar, [
      'day',
      'hour',
      'microsecond',
      'millisecond',
      'minute',
      'month',
      'monthCode',
      'nanosecond',
      'second',
      'year'
    ]);
    const fields = ToTemporalZonedDateTimeFields(item, fieldNames) as any;
    ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond } = InterpretTemporalDateTimeFields(
      calendar,
      fields,
      options
    ));
    timeZone = ToTemporalTimeZone(fields.timeZone);
    offset = fields.offset;
    if (offset === undefined) {
      offsetBehaviour = 'wall';
    } else {
      offset = ToString(offset);
    }
  } else {
    ToTemporalOverflow(options); // validate and ignore
    let ianaName, z;
    ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, ianaName, offset, z, calendar } =
      ParseTemporalZonedDateTimeString(ToString(item)));
    if (!ianaName) throw new RangeError('time zone ID required in brackets');
    if (z) {
      offsetBehaviour = 'exact';
    } else if (!offset) {
      offsetBehaviour = 'wall';
    }
    const TemporalTimeZone = GetIntrinsic('%Temporal.TimeZone%');
    timeZone = new TemporalTimeZone(ianaName);
    if (!calendar) calendar = GetISO8601Calendar();
    calendar = ToTemporalCalendar(calendar);
  }
  let offsetNs = 0;
  if (offsetBehaviour === 'option') offsetNs = ParseOffsetString(offset);
  const disambiguation = ToTemporalDisambiguation(options);
  const offsetOpt = ToTemporalOffset(options, 'reject');
  const epochNanoseconds = InterpretISODateTimeOffset(
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond,
    offsetBehaviour,
    offsetNs,
    timeZone,
    disambiguation,
    offsetOpt
  );
  return CreateTemporalZonedDateTime(epochNanoseconds, timeZone, calendar);
}

export function CreateTemporalDateSlots(result, isoYear, isoMonth, isoDay, calendar) {
  RejectISODate(isoYear, isoMonth, isoDay);
  RejectDateRange(isoYear, isoMonth, isoDay);

  CreateSlots(result);
  SetSlot(result, ISO_YEAR, isoYear);
  SetSlot(result, ISO_MONTH, isoMonth);
  SetSlot(result, ISO_DAY, isoDay);
  SetSlot(result, CALENDAR, calendar);
  SetSlot(result, DATE_BRAND, true);

  if (DEBUG) {
    ObjectDefineProperty(result, '_repr_', {
      value: `${result[Symbol.toStringTag]} <${TemporalDateToString(result)}>`,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }
}

export function CreateTemporalDate(isoYear, isoMonth, isoDay, calendar = GetISO8601Calendar()) {
  const TemporalPlainDate = GetIntrinsic('%Temporal.PlainDate%');
  const result = ObjectCreate(TemporalPlainDate.prototype);
  CreateTemporalDateSlots(result, isoYear, isoMonth, isoDay, calendar);
  return result;
}

export function CreateTemporalDateTimeSlots(result, isoYear, isoMonth, isoDay, h, min, s, ms, µs, ns, calendar) {
  RejectDateTime(isoYear, isoMonth, isoDay, h, min, s, ms, µs, ns);
  RejectDateTimeRange(isoYear, isoMonth, isoDay, h, min, s, ms, µs, ns);

  CreateSlots(result);
  SetSlot(result, ISO_YEAR, isoYear);
  SetSlot(result, ISO_MONTH, isoMonth);
  SetSlot(result, ISO_DAY, isoDay);
  SetSlot(result, ISO_HOUR, h);
  SetSlot(result, ISO_MINUTE, min);
  SetSlot(result, ISO_SECOND, s);
  SetSlot(result, ISO_MILLISECOND, ms);
  SetSlot(result, ISO_MICROSECOND, µs);
  SetSlot(result, ISO_NANOSECOND, ns);
  SetSlot(result, CALENDAR, calendar);

  if (DEBUG) {
    Object.defineProperty(result, '_repr_', {
      value: `${result[Symbol.toStringTag]} <${TemporalDateTimeToString(result, 'auto')}>`,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }
}

export function CreateTemporalDateTime(
  isoYear,
  isoMonth,
  isoDay,
  h,
  min,
  s,
  ms,
  µs,
  ns,
  calendar = GetISO8601Calendar()
) {
  const TemporalPlainDateTime = GetIntrinsic('%Temporal.PlainDateTime%');
  const result = ObjectCreate(TemporalPlainDateTime.prototype);
  CreateTemporalDateTimeSlots(result, isoYear, isoMonth, isoDay, h, min, s, ms, µs, ns, calendar);
  return result;
}

export function CreateTemporalMonthDaySlots(result, isoMonth, isoDay, calendar, referenceISOYear) {
  RejectISODate(referenceISOYear, isoMonth, isoDay);
  RejectDateRange(referenceISOYear, isoMonth, isoDay);

  CreateSlots(result);
  SetSlot(result, ISO_MONTH, isoMonth);
  SetSlot(result, ISO_DAY, isoDay);
  SetSlot(result, ISO_YEAR, referenceISOYear);
  SetSlot(result, CALENDAR, calendar);
  SetSlot(result, MONTH_DAY_BRAND, true);

  if (DEBUG) {
    Object.defineProperty(result, '_repr_', {
      value: `${result[Symbol.toStringTag]} <${TemporalMonthDayToString(result)}>`,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }
}

export function CreateTemporalMonthDay(isoMonth, isoDay, calendar = GetISO8601Calendar(), referenceISOYear = 1972) {
  const TemporalPlainMonthDay = GetIntrinsic('%Temporal.PlainMonthDay%');
  const result = ObjectCreate(TemporalPlainMonthDay.prototype);
  CreateTemporalMonthDaySlots(result, isoMonth, isoDay, calendar, referenceISOYear);
  return result;
}

export function CreateTemporalYearMonthSlots(result, isoYear, isoMonth, calendar, referenceISODay) {
  RejectISODate(isoYear, isoMonth, referenceISODay);
  RejectYearMonthRange(isoYear, isoMonth);

  CreateSlots(result);
  SetSlot(result, ISO_YEAR, isoYear);
  SetSlot(result, ISO_MONTH, isoMonth);
  SetSlot(result, ISO_DAY, referenceISODay);
  SetSlot(result, CALENDAR, calendar);
  SetSlot(result, YEAR_MONTH_BRAND, true);

  if (DEBUG) {
    Object.defineProperty(result, '_repr_', {
      value: `${result[Symbol.toStringTag]} <${TemporalYearMonthToString(result)}>`,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }
}

export function CreateTemporalYearMonth(isoYear, isoMonth, calendar = GetISO8601Calendar(), referenceISODay = 1) {
  const TemporalPlainYearMonth = GetIntrinsic('%Temporal.PlainYearMonth%');
  const result = ObjectCreate(TemporalPlainYearMonth.prototype);
  CreateTemporalYearMonthSlots(result, isoYear, isoMonth, calendar, referenceISODay);
  return result;
}

export function CreateTemporalZonedDateTimeSlots(result, epochNanoseconds, timeZone, calendar) {
  ValidateEpochNanoseconds(epochNanoseconds);

  CreateSlots(result);
  SetSlot(result, EPOCHNANOSECONDS, epochNanoseconds);
  SetSlot(result, TIME_ZONE, timeZone);
  SetSlot(result, CALENDAR, calendar);

  const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
  const instant = new TemporalInstant(GetSlot(result, EPOCHNANOSECONDS));
  SetSlot(result, INSTANT, instant);

  if (DEBUG) {
    Object.defineProperty(result, '_repr_', {
      value: `${result[Symbol.toStringTag]} <${TemporalZonedDateTimeToString(result, 'auto')}>`,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }
}

export function CreateTemporalZonedDateTime(epochNanoseconds, timeZone, calendar = GetISO8601Calendar()) {
  const TemporalZonedDateTime = GetIntrinsic('%Temporal.ZonedDateTime%');
  const result = ObjectCreate(TemporalZonedDateTime.prototype);
  CreateTemporalZonedDateTimeSlots(result, epochNanoseconds, timeZone, calendar);
  return result;
}

export function GetISO8601Calendar() {
  const TemporalCalendar = GetIntrinsic('%Temporal.Calendar%');
  return new TemporalCalendar('iso8601');
}

export function CalendarFields(calendar, fieldNames) {
  if (calendar.fields) {
    fieldNames = calendar.fields(fieldNames);
  }
  const result = [];
  for (const name of fieldNames) {
    if (typeof name !== 'string') throw new TypeError('bad return from calendar.fields()');
    ArrayPrototypePush.call(result, name);
  }
  return result;
}

export function CalendarMergeFields(calendar, fields, additionalFields) {
  const calMergeFields = calendar.mergeFields;
  if (!calMergeFields) {
    return { ...fields, ...additionalFields };
  }
  const result = Reflect.apply(calMergeFields, calendar, [fields, additionalFields]);
  if (!IsObject(result)) throw new TypeError('bad return from calendar.mergeFields()');
  return result;
}

export function CalendarDateAdd(calendar, date, duration, options, dateAdd?: any) {
  if (dateAdd === undefined) {
    dateAdd = calendar.dateAdd;
  }
  const result = ReflectApply(dateAdd, calendar, [date, duration, options]);
  if (!IsTemporalDate(result)) throw new TypeError('invalid result');
  return result;
}

export function CalendarDateUntil(calendar, date, otherDate, options, dateUntil?: any) {
  if (dateUntil === undefined) {
    dateUntil = calendar.dateUntil;
  }
  const result = ReflectApply(dateUntil, calendar, [date, otherDate, options]);
  if (!IsTemporalDuration(result)) throw new TypeError('invalid result');
  return result;
}

export function CalendarYear(calendar, dateLike) {
  const result = calendar.year(dateLike);
  if (result === undefined) {
    throw new RangeError('calendar year result must be an integer');
  }
  return ToIntegerThrowOnInfinity(result);
}

export function CalendarMonth(calendar, dateLike) {
  const result = calendar.month(dateLike);
  if (result === undefined) {
    throw new RangeError('calendar month result must be a positive integer');
  }
  return ToPositiveInteger(result);
}

export function CalendarMonthCode(calendar, dateLike) {
  const result = calendar.monthCode(dateLike);
  if (result === undefined) {
    throw new RangeError('calendar monthCode result must be a string');
  }
  return ToString(result);
}

export function CalendarDay(calendar, dateLike) {
  const result = calendar.day(dateLike);
  if (result === undefined) {
    throw new RangeError('calendar day result must be a positive integer');
  }
  return ToPositiveInteger(result);
}

export function CalendarEra(calendar, dateLike) {
  let result = calendar.era(dateLike);
  if (result !== undefined) {
    result = ToString(result);
  }
  return result;
}

export function CalendarEraYear(calendar, dateLike) {
  let result = calendar.eraYear(dateLike);
  if (result !== undefined) {
    result = ToIntegerThrowOnInfinity(result);
  }
  return result;
}

export function CalendarDayOfWeek(calendar, dateLike) {
  return calendar.dayOfWeek(dateLike);
}

export function CalendarDayOfYear(calendar, dateLike) {
  return calendar.dayOfYear(dateLike);
}

export function CalendarWeekOfYear(calendar, dateLike) {
  return calendar.weekOfYear(dateLike);
}

export function CalendarDaysInWeek(calendar, dateLike) {
  return calendar.daysInWeek(dateLike);
}

export function CalendarDaysInMonth(calendar, dateLike) {
  return calendar.daysInMonth(dateLike);
}

export function CalendarDaysInYear(calendar, dateLike) {
  return calendar.daysInYear(dateLike);
}

export function CalendarMonthsInYear(calendar, dateLike) {
  return calendar.monthsInYear(dateLike);
}

export function CalendarInLeapYear(calendar, dateLike) {
  return calendar.inLeapYear(dateLike);
}

export function ToTemporalCalendar(calendarLike) {
  if (IsObject(calendarLike)) {
    if (HasSlot(calendarLike, CALENDAR)) return GetSlot(calendarLike, CALENDAR);
    if (!('calendar' in calendarLike)) return calendarLike;
    calendarLike = calendarLike.calendar;
    if (IsObject(calendarLike) && !('calendar' in calendarLike)) return calendarLike;
  }
  const identifier = ToString(calendarLike);
  const TemporalCalendar = GetIntrinsic('%Temporal.Calendar%');
  if (IsBuiltinCalendar(identifier)) return new TemporalCalendar(identifier);
  let calendar;
  try {
    ({ calendar } = ParseISODateTime(identifier, { zoneRequired: false }));
  } catch {
    throw new RangeError(`Invalid calendar: ${identifier}`);
  }
  if (!calendar) calendar = 'iso8601';
  return new TemporalCalendar(calendar);
}

function GetTemporalCalendarWithISODefault(item) {
  if (HasSlot(item, CALENDAR)) return GetSlot(item, CALENDAR);
  const { calendar } = item;
  if (calendar === undefined) return GetISO8601Calendar();
  return ToTemporalCalendar(calendar);
}

export function CalendarEquals(one, two) {
  if (one === two) return true;
  const cal1 = ToString(one);
  const cal2 = ToString(two);
  return cal1 === cal2;
}

export function ConsolidateCalendars(one, two) {
  if (one === two) return two;
  const sOne = ToString(one);
  const sTwo = ToString(two);
  if (sOne === sTwo || sOne === 'iso8601') {
    return two;
  } else if (sTwo === 'iso8601') {
    return one;
  } else {
    throw new RangeError('irreconcilable calendars');
  }
}

export function DateFromFields(calendar, fields, options?: any) {
  const result = calendar.dateFromFields(fields, options);
  if (!IsTemporalDate(result)) throw new TypeError('invalid result');
  return result;
}

export function YearMonthFromFields(calendar, fields, options?: any) {
  const result = calendar.yearMonthFromFields(fields, options);
  if (!IsTemporalYearMonth(result)) throw new TypeError('invalid result');
  return result;
}

export function MonthDayFromFields(calendar, fields, options?: any) {
  const result = calendar.monthDayFromFields(fields, options);
  if (!IsTemporalMonthDay(result)) throw new TypeError('invalid result');
  return result;
}

export function ToTemporalTimeZone(temporalTimeZoneLike) {
  if (IsObject(temporalTimeZoneLike)) {
    if (IsTemporalZonedDateTime(temporalTimeZoneLike)) return GetSlot(temporalTimeZoneLike, TIME_ZONE);
    if (!('timeZone' in temporalTimeZoneLike)) return temporalTimeZoneLike;
    temporalTimeZoneLike = temporalTimeZoneLike.timeZone;
    if (IsObject(temporalTimeZoneLike) && !('timeZone' in temporalTimeZoneLike)) {
      return temporalTimeZoneLike;
    }
  }
  const identifier = ToString(temporalTimeZoneLike);
  const timeZone = TemporalTimeZoneFromString(identifier);
  const TemporalTimeZone = GetIntrinsic('%Temporal.TimeZone%');
  return new TemporalTimeZone(timeZone);
}

export function TimeZoneEquals(one, two) {
  if (one === two) return true;
  const tz1 = ToString(one);
  const tz2 = ToString(two);
  return tz1 === tz2;
}

export function TemporalDateTimeToDate(dateTime) {
  return CreateTemporalDate(
    GetSlot(dateTime, ISO_YEAR),
    GetSlot(dateTime, ISO_MONTH),
    GetSlot(dateTime, ISO_DAY),
    GetSlot(dateTime, CALENDAR)
  );
}

export function TemporalDateTimeToTime(dateTime) {
  const Time = GetIntrinsic('%Temporal.PlainTime%');
  return new Time(
    GetSlot(dateTime, ISO_HOUR),
    GetSlot(dateTime, ISO_MINUTE),
    GetSlot(dateTime, ISO_SECOND),
    GetSlot(dateTime, ISO_MILLISECOND),
    GetSlot(dateTime, ISO_MICROSECOND),
    GetSlot(dateTime, ISO_NANOSECOND)
  );
}

export function GetOffsetNanosecondsFor(timeZone, instant) {
  let getOffsetNanosecondsFor = timeZone.getOffsetNanosecondsFor;
  if (getOffsetNanosecondsFor === undefined) {
    getOffsetNanosecondsFor = GetIntrinsic('%Temporal.TimeZone.prototype.getOffsetNanosecondsFor%');
  }
  const offsetNs = Reflect.apply(getOffsetNanosecondsFor, timeZone, [instant]);
  if (typeof offsetNs !== 'number') {
    throw new TypeError('bad return from getOffsetNanosecondsFor');
  }
  if (!IsInteger(offsetNs) || MathAbs(offsetNs) > 86400e9) {
    throw new RangeError('out-of-range return from getOffsetNanosecondsFor');
  }
  return offsetNs;
}

export function BuiltinTimeZoneGetOffsetStringFor(timeZone, instant) {
  const offsetNs = GetOffsetNanosecondsFor(timeZone, instant);
  return FormatTimeZoneOffsetString(offsetNs);
}

export function BuiltinTimeZoneGetPlainDateTimeFor(timeZone, instant, calendar) {
  const ns = GetSlot(instant, EPOCHNANOSECONDS);
  const offsetNs = GetOffsetNanosecondsFor(timeZone, instant);
  let { year, month, day, hour, minute, second, millisecond, microsecond, nanosecond } = GetISOPartsFromEpoch(ns);
  ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond } = BalanceISODateTime(
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond + offsetNs
  ));
  return CreateTemporalDateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar);
}

export function BuiltinTimeZoneGetInstantFor(timeZone, dateTime, disambiguation) {
  const possibleInstants = GetPossibleInstantsFor(timeZone, dateTime);
  return DisambiguatePossibleInstants(possibleInstants, timeZone, dateTime, disambiguation);
}

function DisambiguatePossibleInstants(possibleInstants, timeZone, dateTime, disambiguation) {
  const Instant = GetIntrinsic('%Temporal.Instant%');
  const numInstants = possibleInstants.length;

  if (numInstants === 1) return possibleInstants[0];
  if (numInstants) {
    switch (disambiguation) {
      case 'compatible':
      // fall through because 'compatible' means 'earlier' for "fall back" transitions
      case 'earlier':
        return possibleInstants[0];
      case 'later':
        return possibleInstants[numInstants - 1];
      case 'reject': {
        throw new RangeError('multiple instants found');
      }
    }
  }

  const year = GetSlot(dateTime, ISO_YEAR);
  const month = GetSlot(dateTime, ISO_MONTH);
  const day = GetSlot(dateTime, ISO_DAY);
  const hour = GetSlot(dateTime, ISO_HOUR);
  const minute = GetSlot(dateTime, ISO_MINUTE);
  const second = GetSlot(dateTime, ISO_SECOND);
  const millisecond = GetSlot(dateTime, ISO_MILLISECOND);
  const microsecond = GetSlot(dateTime, ISO_MICROSECOND);
  const nanosecond = GetSlot(dateTime, ISO_NANOSECOND);
  const utcns = GetEpochFromISOParts(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
  if (utcns === null) throw new RangeError('DateTime outside of supported range');
  const dayBefore = new Instant(JSBI.subtract(utcns, DAY_NANOS));
  const dayAfter = new Instant(JSBI.add(utcns, DAY_NANOS));
  const offsetBefore = GetOffsetNanosecondsFor(timeZone, dayBefore);
  const offsetAfter = GetOffsetNanosecondsFor(timeZone, dayAfter);
  const nanoseconds = offsetAfter - offsetBefore;
  switch (disambiguation) {
    case 'earlier': {
      const calendar = GetSlot(dateTime, CALENDAR);
      const PlainDateTime = GetIntrinsic('%Temporal.PlainDateTime%');
      const earlier = AddDateTime(
        year,
        month,
        day,
        hour,
        minute,
        second,
        millisecond,
        microsecond,
        nanosecond,
        calendar,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        -nanoseconds,
        undefined
      );
      const earlierPlainDateTime = new PlainDateTime(
        earlier.year,
        earlier.month,
        earlier.day,
        earlier.hour,
        earlier.minute,
        earlier.second,
        earlier.millisecond,
        earlier.microsecond,
        earlier.nanosecond,
        calendar
      );
      return GetPossibleInstantsFor(timeZone, earlierPlainDateTime)[0];
    }
    case 'compatible':
    // fall through because 'compatible' means 'later' for "spring forward" transitions
    case 'later': {
      const calendar = GetSlot(dateTime, CALENDAR);
      const PlainDateTime = GetIntrinsic('%Temporal.PlainDateTime%');
      const later = AddDateTime(
        year,
        month,
        day,
        hour,
        minute,
        second,
        millisecond,
        microsecond,
        nanosecond,
        calendar,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        nanoseconds,
        undefined
      );
      const laterPlainDateTime = new PlainDateTime(
        later.year,
        later.month,
        later.day,
        later.hour,
        later.minute,
        later.second,
        later.millisecond,
        later.microsecond,
        later.nanosecond,
        calendar
      );
      const possible = GetPossibleInstantsFor(timeZone, laterPlainDateTime);
      return possible[possible.length - 1];
    }
    case 'reject': {
      throw new RangeError('no such instant found');
    }
  }
}

function GetPossibleInstantsFor(timeZone, dateTime) {
  const possibleInstants = timeZone.getPossibleInstantsFor(dateTime);
  const result = [];
  for (const instant of possibleInstants) {
    if (!IsTemporalInstant(instant)) {
      throw new TypeError('bad return from getPossibleInstantsFor');
    }
    ArrayPrototypePush.call(result, instant);
  }
  return result;
}

export function ISOYearString(year) {
  let yearString;
  if (year < 1000 || year > 9999) {
    const sign = year < 0 ? '-' : '+';
    const yearNumber = MathAbs(year);
    yearString = sign + `000000${yearNumber}`.slice(-6);
  } else {
    yearString = `${year}`;
  }
  return yearString;
}

export function ISODateTimePartString(part) {
  return `00${part}`.slice(-2);
}
export function FormatSecondsStringPart(second, millisecond, microsecond, nanosecond, precision) {
  if (precision === 'minute') return '';

  const secs = `:${ISODateTimePartString(second)}`;
  let fraction = millisecond * 1e6 + microsecond * 1e3 + nanosecond;

  if (precision === 'auto') {
    if (fraction === 0) return secs;
    fraction = `${fraction}`.padStart(9, '0');
    while (fraction[fraction.length - 1] === '0') fraction = fraction.slice(0, -1);
  } else {
    if (precision === 0) return secs;
    fraction = `${fraction}`.padStart(9, '0').slice(0, precision);
  }
  return `${secs}.${fraction}`;
}

export function TemporalInstantToString(instant, timeZone, precision) {
  let outputTimeZone = timeZone;
  if (outputTimeZone === undefined) {
    const TemporalTimeZone = GetIntrinsic('%Temporal.TimeZone%');
    outputTimeZone = new TemporalTimeZone('UTC');
  }
  const iso = GetISO8601Calendar();
  const dateTime = BuiltinTimeZoneGetPlainDateTimeFor(outputTimeZone, instant, iso);
  const year = ISOYearString(GetSlot(dateTime, ISO_YEAR));
  const month = ISODateTimePartString(GetSlot(dateTime, ISO_MONTH));
  const day = ISODateTimePartString(GetSlot(dateTime, ISO_DAY));
  const hour = ISODateTimePartString(GetSlot(dateTime, ISO_HOUR));
  const minute = ISODateTimePartString(GetSlot(dateTime, ISO_MINUTE));
  const seconds = FormatSecondsStringPart(
    GetSlot(dateTime, ISO_SECOND),
    GetSlot(dateTime, ISO_MILLISECOND),
    GetSlot(dateTime, ISO_MICROSECOND),
    GetSlot(dateTime, ISO_NANOSECOND),
    precision
  );
  let timeZoneString = 'Z';
  if (timeZone !== undefined) timeZoneString = BuiltinTimeZoneGetOffsetStringFor(outputTimeZone, instant);
  return `${year}-${month}-${day}T${hour}:${minute}${seconds}${timeZoneString}`;
}

export function TemporalDurationToString(
  duration: Temporal.Duration,
  precision: 'auto' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 'auto',
  options?: {
    unit: 'minute'|'second'|'millisecond'|'microsecond'|'nanosecond',
    increment: number;
    roundingMode?: Temporal.RoundingMode
  },
) {
  function formatNumber(num: number) {
    if (num < NumberMaxSafeInteger) return num.toString(10);
    return JSBI.BigInt(num).toString(10);
  }

  const years = GetSlot(duration, YEARS);
  const months = GetSlot(duration, MONTHS);
  const weeks = GetSlot(duration, WEEKS);
  const days = GetSlot(duration, DAYS);
  const hours = GetSlot(duration, HOURS);
  const minutes = GetSlot(duration, MINUTES);
  let seconds = GetSlot(duration, SECONDS);
  let ms = GetSlot(duration, MILLISECONDS);
  let µs = GetSlot(duration, MICROSECONDS);
  let ns = GetSlot(duration, NANOSECONDS);
  const sign = DurationSign(years, months, weeks, days, hours, minutes, seconds, ms, µs, ns);

  if (options) {
    const { unit, increment, roundingMode } = options;
    ({
      seconds,
      milliseconds: ms,
      microseconds: µs,
      nanoseconds: ns
    } = RoundDuration(0, 0, 0, 0, 0, 0, seconds, ms, µs, ns, increment, unit, roundingMode));
  }

  const dateParts = [];
  if (years) dateParts.push(`${formatNumber(MathAbs(years))}Y`);
  if (months) dateParts.push(`${formatNumber(MathAbs(months))}M`);
  if (weeks) dateParts.push(`${formatNumber(MathAbs(weeks))}W`);
  if (days) dateParts.push(`${formatNumber(MathAbs(days))}D`);

  const timeParts = [];
  if (hours) timeParts.push(`${formatNumber(MathAbs(hours))}H`);
  if (minutes) timeParts.push(`${formatNumber(MathAbs(minutes))}M`);

  const secondParts = [];
  let total = TotalDurationNanoseconds(0, 0, 0, seconds, ms, µs, ns, 0);
  let leftoverNanoseconds: JSBI;
  let leftoverMicroseconds: JSBI;
  let leftoverMilliseconds: JSBI;
  let leftoverSeconds: JSBI;
  ({ quotient: total, remainder: leftoverNanoseconds } = divmod(total, JSBI.BigInt(1000)));
  ({ quotient: total, remainder: leftoverMicroseconds } = divmod(total, JSBI.BigInt(1000)));
  ({ quotient: leftoverSeconds, remainder: leftoverMilliseconds } = divmod(total, JSBI.BigInt(1000)));
  const fraction = MathAbs(JSBI.toNumber(leftoverMilliseconds)) * 1e6 + MathAbs(JSBI.toNumber(leftoverMicroseconds)) * 1e3 + MathAbs(JSBI.toNumber(leftoverNanoseconds));
  let decimalPart;
  if (precision === 'auto') {
    if (fraction !== 0) {
      decimalPart = `${fraction}`.padStart(9, '0');
      while (decimalPart[decimalPart.length - 1] === '0') {
        decimalPart = decimalPart.slice(0, -1);
      }
    }
  } else if (precision !== 0) {
    decimalPart = `${fraction}`.padStart(9, '0').slice(0, precision);
  }
  if (decimalPart) secondParts.unshift('.', decimalPart);
  if (!JSBI.equal(leftoverSeconds, ZERO) || secondParts.length) secondParts.unshift(abs(leftoverSeconds).toString());
  if (secondParts.length) timeParts.push(`${secondParts.join('')}S`);
  if (timeParts.length) timeParts.unshift('T');
  if (!dateParts.length && !timeParts.length) return 'PT0S';
  return `${sign < 0 ? '-' : ''}P${dateParts.join('')}${timeParts.join('')}`;
}

export function TemporalDateToString(date, showCalendar = 'auto') {
  const year = ISOYearString(GetSlot(date, ISO_YEAR));
  const month = ISODateTimePartString(GetSlot(date, ISO_MONTH));
  const day = ISODateTimePartString(GetSlot(date, ISO_DAY));
  const calendarID = ToString(GetSlot(date, CALENDAR));
  const calendar = FormatCalendarAnnotation(calendarID, showCalendar);
  return `${year}-${month}-${day}${calendar}`;
}

export function TemporalDateTimeToString(dateTime, precision, showCalendar = 'auto', options = undefined) {
  let year = GetSlot(dateTime, ISO_YEAR);
  let month = GetSlot(dateTime, ISO_MONTH);
  let day = GetSlot(dateTime, ISO_DAY);
  let hour = GetSlot(dateTime, ISO_HOUR);
  let minute = GetSlot(dateTime, ISO_MINUTE);
  let second = GetSlot(dateTime, ISO_SECOND);
  let millisecond = GetSlot(dateTime, ISO_MILLISECOND);
  let microsecond = GetSlot(dateTime, ISO_MICROSECOND);
  let nanosecond = GetSlot(dateTime, ISO_NANOSECOND);

  if (options) {
    const { unit, increment, roundingMode } = options;
    ({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond } = RoundISODateTime(
      year,
      month,
      day,
      hour,
      minute,
      second,
      millisecond,
      microsecond,
      nanosecond,
      increment,
      unit,
      roundingMode
    ));
  }

  const years = ISOYearString(year);
  const months = ISODateTimePartString(month);
  const days = ISODateTimePartString(day);
  const hours = ISODateTimePartString(hour);
  const minutes = ISODateTimePartString(minute);
  const seconds = FormatSecondsStringPart(second, millisecond, microsecond, nanosecond, precision);
  const calendarID = ToString(GetSlot(dateTime, CALENDAR));
  const calendar = FormatCalendarAnnotation(calendarID, showCalendar);
  return `${years}-${months}-${days}T${hours}:${minutes}${seconds}${calendar}`;
}

export function TemporalMonthDayToString(monthDay, showCalendar = 'auto') {
  const month = ISODateTimePartString(GetSlot(monthDay, ISO_MONTH));
  const day = ISODateTimePartString(GetSlot(monthDay, ISO_DAY));
  let resultString = `${month}-${day}`;
  const calendar = GetSlot(monthDay, CALENDAR);
  const calendarID = ToString(calendar);
  if (calendarID !== 'iso8601') {
    const year = ISOYearString(GetSlot(monthDay, ISO_YEAR));
    resultString = `${year}-${resultString}`;
  }
  const calendarString = FormatCalendarAnnotation(calendarID, showCalendar);
  if (calendarString) resultString += calendarString;
  return resultString;
}

export function TemporalYearMonthToString(yearMonth, showCalendar = 'auto') {
  const year = ISOYearString(GetSlot(yearMonth, ISO_YEAR));
  const month = ISODateTimePartString(GetSlot(yearMonth, ISO_MONTH));
  let resultString = `${year}-${month}`;
  const calendar = GetSlot(yearMonth, CALENDAR);
  const calendarID = ToString(calendar);
  if (calendarID !== 'iso8601') {
    const day = ISODateTimePartString(GetSlot(yearMonth, ISO_DAY));
    resultString += `-${day}`;
  }
  const calendarString = FormatCalendarAnnotation(calendarID, showCalendar);
  if (calendarString) resultString += calendarString;
  return resultString;
}

export function TemporalZonedDateTimeToString(
  zdt,
  precision,
  showCalendar = 'auto',
  showTimeZone = 'auto',
  showOffset = 'auto',
  options = undefined
) {
  let instant = GetSlot(zdt, INSTANT);

  if (options) {
    const { unit, increment, roundingMode } = options;
    const ns = RoundInstant(GetSlot(zdt, EPOCHNANOSECONDS), increment, unit, roundingMode);
    const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
    instant = new TemporalInstant(ns);
  }

  const tz = GetSlot(zdt, TIME_ZONE);
  const iso = GetISO8601Calendar();
  const dateTime = BuiltinTimeZoneGetPlainDateTimeFor(tz, instant, iso);

  const year = ISOYearString(GetSlot(dateTime, ISO_YEAR));
  const month = ISODateTimePartString(GetSlot(dateTime, ISO_MONTH));
  const day = ISODateTimePartString(GetSlot(dateTime, ISO_DAY));
  const hour = ISODateTimePartString(GetSlot(dateTime, ISO_HOUR));
  const minute = ISODateTimePartString(GetSlot(dateTime, ISO_MINUTE));
  const seconds = FormatSecondsStringPart(
    GetSlot(dateTime, ISO_SECOND),
    GetSlot(dateTime, ISO_MILLISECOND),
    GetSlot(dateTime, ISO_MICROSECOND),
    GetSlot(dateTime, ISO_NANOSECOND),
    precision
  );
  let result = `${year}-${month}-${day}T${hour}:${minute}${seconds}`;
  if (showOffset !== 'never') result += BuiltinTimeZoneGetOffsetStringFor(tz, instant);
  if (showTimeZone !== 'never') result += `[${tz}]`;
  const calendarID = ToString(GetSlot(zdt, CALENDAR));
  result += FormatCalendarAnnotation(calendarID, showCalendar);
  return result;
}

export function ParseOffsetString(string) {
  const match = OFFSET.exec(String(string));
  if (!match) return null;
  const sign = match[1] === '-' || match[1] === '\u2212' ? -1 : +1;
  const hours = +match[2];
  const minutes = +(match[3] || 0);
  const seconds = +(match[4] || 0);
  const nanoseconds = +((match[5] || 0) + '000000000').slice(0, 9);
  return sign * (((hours * 60 + minutes) * 60 + seconds) * 1e9 + nanoseconds);
}

export function GetCanonicalTimeZoneIdentifier(timeZoneIdentifier) {
  const offsetNs = ParseOffsetString(timeZoneIdentifier);
  if (offsetNs !== null) return FormatTimeZoneOffsetString(offsetNs);
  const formatter = getIntlDateTimeFormatEnUsForTimeZone(String(timeZoneIdentifier));
  return formatter.resolvedOptions().timeZone;
}

export function GetIANATimeZoneOffsetNanoseconds(epochNanoseconds, id) {
  const { year, month, day, hour, minute, second, millisecond, microsecond, nanosecond } = GetIANATimeZoneDateTimeParts(
    epochNanoseconds,
    id
  );
  const utc = GetEpochFromISOParts(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
  if (utc === null) throw new RangeError('Date outside of supported range');
  return JSBI.toNumber(JSBI.subtract(utc, epochNanoseconds));
}

function FormatTimeZoneOffsetString(offsetNanoseconds) {
  const sign = offsetNanoseconds < 0 ? '-' : '+';
  offsetNanoseconds = MathAbs(offsetNanoseconds);
  const nanoseconds = offsetNanoseconds % 1e9;
  const seconds = MathFloor(offsetNanoseconds / 1e9) % 60;
  const minutes = MathFloor(offsetNanoseconds / 60e9) % 60;
  const hours = MathFloor(offsetNanoseconds / 3600e9);

  const hourString = ISODateTimePartString(hours);
  const minuteString = ISODateTimePartString(minutes);
  const secondString = ISODateTimePartString(seconds);
  let post = '';
  if (nanoseconds) {
    let fraction = `${nanoseconds}`.padStart(9, '0');
    while (fraction[fraction.length - 1] === '0') fraction = fraction.slice(0, -1);
    post = `:${secondString}.${fraction}`;
  } else if (seconds) {
    post = `:${secondString}`;
  }
  return `${sign}${hourString}:${minuteString}${post}`;
}

export function GetEpochFromISOParts(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond) {
  // Note: Date.UTC() interprets one and two-digit years as being in the
  // 20th century, so don't use it
  const legacyDate = new Date();
  legacyDate.setUTCHours(hour, minute, second, millisecond);
  legacyDate.setUTCFullYear(year, month - 1, day);
  const ms = legacyDate.getTime();
  if (NumberIsNaN(ms)) return null;
  let ns = JSBI.multiply(JSBI.BigInt(ms), JSBI.BigInt(1e6));
  ns = JSBI.add(ns, JSBI.multiply(JSBI.BigInt(microsecond), JSBI.BigInt(1e3)));
  ns = JSBI.add(ns, JSBI.BigInt(nanosecond));
  if (JSBI.lessThan(ns, NS_MIN) || JSBI.greaterThan(ns, NS_MAX)) return null;
  return ns;
}

function GetISOPartsFromEpoch(epochNanoseconds: JSBI) {
  const { quotient, remainder } = divmod(epochNanoseconds, JSBI.BigInt(1e6));
  let epochMilliseconds = +quotient;
  let nanos = +remainder;
  if (nanos < 0) {
    nanos += 1e6;
    epochMilliseconds -= 1;
  }
  const microsecond = MathFloor(nanos / 1e3) % 1e3;
  const nanosecond = nanos % 1e3;

  const item = new Date(epochMilliseconds);
  const year = item.getUTCFullYear();
  const month = item.getUTCMonth() + 1;
  const day = item.getUTCDate();
  const hour = item.getUTCHours();
  const minute = item.getUTCMinutes();
  const second = item.getUTCSeconds();
  const millisecond = item.getUTCMilliseconds();

  return { epochMilliseconds, year, month, day, hour, minute, second, millisecond, microsecond, nanosecond };
}

// ts-prune-ignore-next TODO: remove this after tests are converted to TS
export function GetIANATimeZoneDateTimeParts(epochNanoseconds: JSBI, id) {
  const { epochMilliseconds, millisecond, microsecond, nanosecond } = GetISOPartsFromEpoch(epochNanoseconds);
  const { year, month, day, hour, minute, second } = GetFormatterParts(id, epochMilliseconds);
  return BalanceISODateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
}

export function GetIANATimeZoneNextTransition(epochNanoseconds, id) {
  const uppercap = JSBI.add(SystemUTCEpochNanoSeconds(), JSBI.multiply(DAY_NANOS, JSBI.BigInt(366)));
  let leftNanos = epochNanoseconds;
  const leftOffsetNs = GetIANATimeZoneOffsetNanoseconds(leftNanos, id);
  let rightNanos = leftNanos;
  let rightOffsetNs = leftOffsetNs;
  while (leftOffsetNs === rightOffsetNs && JSBI.lessThan(JSBI.BigInt(leftNanos), uppercap)) {
    rightNanos = JSBI.add(leftNanos, JSBI.multiply(DAY_NANOS, JSBI.BigInt(2 * 7)));
    rightOffsetNs = GetIANATimeZoneOffsetNanoseconds(rightNanos, id);
    if (leftOffsetNs === rightOffsetNs) {
      leftNanos = rightNanos;
    }
  }
  if (leftOffsetNs === rightOffsetNs) return null;
  const result = bisect(
    (epochNs) => GetIANATimeZoneOffsetNanoseconds(epochNs, id),
    leftNanos,
    rightNanos,
    leftOffsetNs,
    rightOffsetNs
  );
  return result;
}

export function GetIANATimeZonePreviousTransition(epochNanoseconds, id) {
  const lowercap = BEFORE_FIRST_DST; // 1847-01-01T00:00:00Z
  let rightNanos = JSBI.subtract(epochNanoseconds, JSBI.BigInt(1));
  const rightOffsetNs = GetIANATimeZoneOffsetNanoseconds(rightNanos, id);
  let leftNanos = rightNanos;
  let leftOffsetNs = rightOffsetNs;
  while (rightOffsetNs === leftOffsetNs && JSBI.greaterThan(rightNanos, lowercap)) {
    leftNanos = JSBI.subtract(rightNanos, JSBI.multiply(DAY_NANOS, JSBI.BigInt(2 * 7)));
    leftOffsetNs = GetIANATimeZoneOffsetNanoseconds(leftNanos, id);
    if (rightOffsetNs === leftOffsetNs) {
      rightNanos = leftNanos;
    }
  }
  if (rightOffsetNs === leftOffsetNs) return null;
  const result = bisect(
    (epochNs) => GetIANATimeZoneOffsetNanoseconds(epochNs, id),
    leftNanos,
    rightNanos,
    leftOffsetNs,
    rightOffsetNs
  );
  return result;
}

// ts-prune-ignore-next TODO: remove this after tests are converted to TS
export function GetFormatterParts(timeZone, epochMilliseconds) {
  const formatter = getIntlDateTimeFormatEnUsForTimeZone(timeZone);
  // FIXME: can this use formatToParts instead?
  const datetime = formatter.format(new Date(epochMilliseconds));
  const [date, fullYear, time] = datetime.split(/,\s+/);
  const [month, day] = date.split(' ');
  const [year, era] = fullYear.split(' ');
  const [hour, minute, second] = time.split(':');
  return {
    year: era === 'BC' ? -year + 1 : +year,
    month: +month,
    day: +day,
    hour: hour === '24' ? 0 : +hour, // bugs.chromium.org/p/chromium/issues/detail?id=1045791
    minute: +minute,
    second: +second
  };
}

export function GetIANATimeZoneEpochValue(
  id,
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
  microsecond,
  nanosecond
) {
  const ns = GetEpochFromISOParts(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
  if (ns === null) throw new RangeError('DateTime outside of supported range');
  let nsEarlier = JSBI.subtract(ns, DAY_NANOS);
  if (JSBI.lessThan(nsEarlier, NS_MIN)) nsEarlier = ns;
  let nsLater = JSBI.add(ns, DAY_NANOS);
  if (JSBI.greaterThan(nsLater, NS_MAX)) nsLater = ns;
  const earliest = GetIANATimeZoneOffsetNanoseconds(nsEarlier, id);
  const latest = GetIANATimeZoneOffsetNanoseconds(nsLater, id);
  const found = earliest === latest ? [earliest] : [earliest, latest];
  return found
    .map((offsetNanoseconds) => {
      const epochNanoseconds = JSBI.subtract(ns, JSBI.BigInt(offsetNanoseconds));
      const parts = GetIANATimeZoneDateTimeParts(epochNanoseconds, id);
      if (
        year !== parts.year ||
        month !== parts.month ||
        day !== parts.day ||
        hour !== parts.hour ||
        minute !== parts.minute ||
        second !== parts.second ||
        millisecond !== parts.millisecond ||
        microsecond !== parts.microsecond ||
        nanosecond !== parts.nanosecond
      ) {
        return undefined;
      }
      return epochNanoseconds;
    })
    .filter((x) => x !== undefined);
}

export function LeapYear(year) {
  if (undefined === year) return false;
  const isDiv4 = year % 4 === 0;
  const isDiv100 = year % 100 === 0;
  const isDiv400 = year % 400 === 0;
  return isDiv4 && (!isDiv100 || isDiv400);
}

export function ISODaysInMonth(year, month) {
  const DoM = {
    standard: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    leapyear: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  };
  return DoM[LeapYear(year) ? 'leapyear' : 'standard'][month - 1];
}

export function DayOfWeek(year, month, day) {
  const m = month + (month < 3 ? 10 : -2);
  const Y = year - (month < 3 ? 1 : 0);

  const c = MathFloor(Y / 100);
  const y = Y - c * 100;
  const d = day;

  const pD = d;
  const pM = MathFloor(2.6 * m - 0.2);
  const pY = y + MathFloor(y / 4);
  const pC = MathFloor(c / 4) - 2 * c;

  const dow = (pD + pM + pY + pC) % 7;

  return dow + (dow <= 0 ? 7 : 0);
}

export function DayOfYear(year, month, day) {
  let days = day;
  for (let m = month - 1; m > 0; m--) {
    days += ISODaysInMonth(year, m);
  }
  return days;
}

export function WeekOfYear(year, month, day) {
  const doy = DayOfYear(year, month, day);
  const dow = DayOfWeek(year, month, day) || 7;
  const doj = DayOfWeek(year, 1, 1);

  const week = MathFloor((doy - dow + 10) / 7);

  if (week < 1) {
    if (doj === 5 || (doj === 6 && LeapYear(year - 1))) {
      return 53;
    } else {
      return 52;
    }
  }
  if (week === 53) {
    if ((LeapYear(year) ? 366 : 365) - doy < 4 - dow) {
      return 1;
    }
  }

  return week;
}

export function DurationSign(y: number, mon: number, w: number, d: number, h: number, min: number, s: number, ms: number, µs: number, ns: number): Temporal.ComparisonResult {
  for (const prop of [y, mon, w, d, h, min, s, ms, µs, ns]) {
    if (prop !== 0) return prop < 0 ? -1 : 1;
  }
  return 0;
}

function BalanceISOYearMonth(year, month) {
  if (!NumberIsFinite(year) || !NumberIsFinite(month)) throw new RangeError('infinity is out of range');
  month -= 1;
  year += MathFloor(month / 12);
  month %= 12;
  if (month < 0) month += 12;
  month += 1;
  return { year, month };
}

function BalanceISODate(year, month, day) {
  if (!NumberIsFinite(day)) throw new RangeError('infinity is out of range');
  ({ year, month } = BalanceISOYearMonth(year, month));
  let daysInYear = 0;
  let testYear = month > 2 ? year : year - 1;
  while (((daysInYear = LeapYear(testYear) ? 366 : 365), day < -daysInYear)) {
    year -= 1;
    testYear -= 1;
    day += daysInYear;
  }
  testYear += 1;
  while (((daysInYear = LeapYear(testYear) ? 366 : 365), day > daysInYear)) {
    year += 1;
    testYear += 1;
    day -= daysInYear;
  }

  while (day < 1) {
    ({ year, month } = BalanceISOYearMonth(year, month - 1));
    day += ISODaysInMonth(year, month);
  }
  while (day > ISODaysInMonth(year, month)) {
    day -= ISODaysInMonth(year, month);
    ({ year, month } = BalanceISOYearMonth(year, month + 1));
  }

  return { year, month, day };
}

function BalanceISODateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond) {
  let deltaDays;
  ({ deltaDays, hour, minute, second, millisecond, microsecond, nanosecond } = BalanceTime(
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond
  ));
  ({ year, month, day } = BalanceISODate(year, month, day + deltaDays));
  return { year, month, day, hour, minute, second, millisecond, microsecond, nanosecond };
}

function BalanceTime(hour, minute, second, millisecond, microsecond, nanosecond) {
  if (
    !NumberIsFinite(hour) ||
    !NumberIsFinite(minute) ||
    !NumberIsFinite(second) ||
    !NumberIsFinite(millisecond) ||
    !NumberIsFinite(microsecond) ||
    !NumberIsFinite(nanosecond)
  ) {
    throw new RangeError('infinity is out of range');
  }

  microsecond += MathFloor(nanosecond / 1000);
  nanosecond = NonNegativeModulo(nanosecond, 1000);

  millisecond += MathFloor(microsecond / 1000);
  microsecond = NonNegativeModulo(microsecond, 1000);

  second += MathFloor(millisecond / 1000);
  millisecond = NonNegativeModulo(millisecond, 1000);

  minute += MathFloor(second / 60);
  second = NonNegativeModulo(second, 60);

  hour += MathFloor(minute / 60);
  minute = NonNegativeModulo(minute, 60);

  const deltaDays = MathFloor(hour / 24);
  hour = NonNegativeModulo(hour, 24);

  return { deltaDays, hour, minute, second, millisecond, microsecond, nanosecond };
}

export function TotalDurationNanoseconds(
  days: number = 0,
  hours: number = 0,
  minutes: number = 0,
  seconds: number = 0,
  milliseconds: number = 0,
  microseconds: number = 0,
  nanoseconds: number = 0,
  offsetShift: number = 0
) {
  let resultNanos = JSBI.BigInt(nanoseconds);
  if (days !== 0) resultNanos = JSBI.subtract(resultNanos, JSBI.BigInt(offsetShift));
  let tmp = JSBI.BigInt(hours);
  tmp = JSBI.add(tmp, JSBI.multiply(JSBI.BigInt(days), JSBI.BigInt(24)));
  // tmp: total in hours
  tmp = JSBI.add(JSBI.BigInt(minutes), JSBI.multiply(tmp, JSBI.BigInt(60)));
  // tmp: total in minutes
  tmp = JSBI.add(JSBI.BigInt(seconds), JSBI.multiply(tmp, JSBI.BigInt(60)));
  // tmp: total in seconds
  tmp = JSBI.add(JSBI.BigInt(milliseconds), JSBI.multiply(tmp, JSBI.BigInt(1e3)));
  // tmp: total in milliseconds
  tmp = JSBI.add(JSBI.BigInt(microseconds), JSBI.multiply(tmp, JSBI.BigInt(1e3)));
  // tmp: total in microseconds
  return JSBI.add(resultNanos, JSBI.multiply(tmp, JSBI.BigInt(1e3)));
}

function NanosecondsToDays(nanosecondsParam: JSBI, relativeTo): {days: number, nanoseconds: JSBI, dayLengthNs: number} {
  const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
  const sign = bigIntSign(nanosecondsParam);
  let nsBI = nanosecondsParam;
  let dayLengthNs = 86400e9;
  if (sign === 0) return { days: 0, nanoseconds: ZERO, dayLengthNs };
  if (!IsTemporalZonedDateTime(relativeTo)) {
    let days: JSBI;
    ({ quotient: days, remainder: nsBI } = divmod(nsBI, JSBI.BigInt(dayLengthNs)));
    return { days: JSBI.toNumber(days), nanoseconds: nsBI, dayLengthNs };
  }

  const startNs = GetSlot(relativeTo, EPOCHNANOSECONDS);
  const start = GetSlot(relativeTo, INSTANT);
  const endNs = JSBI.add(startNs, nsBI);
  const end = new TemporalInstant(endNs);
  const timeZone = GetSlot(relativeTo, TIME_ZONE);
  const calendar = GetSlot(relativeTo, CALENDAR);

  // Find the difference in days only.
  const dtStart = BuiltinTimeZoneGetPlainDateTimeFor(timeZone, start, calendar);
  const dtEnd = BuiltinTimeZoneGetPlainDateTimeFor(timeZone, end, calendar);
  let { days } = DifferenceISODateTime(
    GetSlot(dtStart, ISO_YEAR),
    GetSlot(dtStart, ISO_MONTH),
    GetSlot(dtStart, ISO_DAY),
    GetSlot(dtStart, ISO_HOUR),
    GetSlot(dtStart, ISO_MINUTE),
    GetSlot(dtStart, ISO_SECOND),
    GetSlot(dtStart, ISO_MILLISECOND),
    GetSlot(dtStart, ISO_MICROSECOND),
    GetSlot(dtStart, ISO_NANOSECOND),
    GetSlot(dtEnd, ISO_YEAR),
    GetSlot(dtEnd, ISO_MONTH),
    GetSlot(dtEnd, ISO_DAY),
    GetSlot(dtEnd, ISO_HOUR),
    GetSlot(dtEnd, ISO_MINUTE),
    GetSlot(dtEnd, ISO_SECOND),
    GetSlot(dtEnd, ISO_MILLISECOND),
    GetSlot(dtEnd, ISO_MICROSECOND),
    GetSlot(dtEnd, ISO_NANOSECOND),
    calendar,
    'day'
  );
  let intermediateNs = AddZonedDateTime(start, timeZone, calendar, 0, 0, 0, days, 0, 0, 0, 0, 0, 0);
  // may disambiguate

  // If clock time after addition was in the middle of a skipped period, the
  // endpoint was disambiguated to a later clock time. So it's possible that
  // the resulting disambiguated result is later than endNs. If so, then back
  // up one day and try again. Repeat if necessary (some transitions are
  // > 24 hours) until either there's zero days left or the date duration is
  // back inside the period where it belongs. Note that this case only can
  // happen for positive durations because the only direction that
  // `disambiguation: 'compatible'` can change clock time is forwards.
  if (sign === 1) {
    while (days > 0 && JSBI.greaterThan(intermediateNs, endNs)) {
      --days;
      intermediateNs = AddZonedDateTime(start, timeZone, calendar, 0, 0, 0, days, 0, 0, 0, 0, 0, 0);
      // may do disambiguation
    }
  }
  nsBI = JSBI.subtract(endNs, intermediateNs);

  let isOverflow = false;
  let relativeInstant = new TemporalInstant(intermediateNs);
  do {
    // calculate length of the next day (day that contains the time remainder)
    const oneDayFartherNs = AddZonedDateTime(relativeInstant, timeZone, calendar, 0, 0, 0, sign, 0, 0, 0, 0, 0, 0);
    const relativeNs = GetSlot(relativeInstant, EPOCHNANOSECONDS);
    dayLengthNs = JSBI.toNumber(JSBI.subtract(oneDayFartherNs, relativeNs));
    isOverflow = JSBI.greaterThan(JSBI.multiply(JSBI.subtract(nsBI, JSBI.BigInt(dayLengthNs)), JSBI.BigInt(sign)), ZERO);
    if (isOverflow) {
      nsBI = JSBI.subtract(nsBI, JSBI.BigInt(dayLengthNs));
      relativeInstant = new TemporalInstant(oneDayFartherNs);
      days += sign;
    }
  } while (isOverflow);
  return { days, nanoseconds: nsBI, dayLengthNs: MathAbs(dayLengthNs) };
}

export function BalanceDuration(
  days: number,
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
  microseconds: number,
  nanoseconds: number,
  largestUnit: AllowedUnit,
  relativeTo = undefined
) {
  let ns: JSBI;
  if (IsTemporalZonedDateTime(relativeTo)) {
    const endNs = AddZonedDateTime(
      GetSlot(relativeTo, INSTANT),
      GetSlot(relativeTo, TIME_ZONE),
      GetSlot(relativeTo, CALENDAR),
      0,
      0,
      0,
      days,
      hours,
      minutes,
      seconds,
      milliseconds,
      microseconds,
      nanoseconds
    );
    const startNs = GetSlot(relativeTo, EPOCHNANOSECONDS);
    ns = JSBI.subtract(endNs, startNs);
  } else {
    ns = TotalDurationNanoseconds(days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds, 0);
  }
  if (largestUnit === 'year' || largestUnit === 'month' || largestUnit === 'week' || largestUnit === 'day') {
    ({ days, nanoseconds: ns } = NanosecondsToDays(ns, relativeTo));
  } else {
    days = 0;
  }

  const sign = JSBI.lessThan(ns, ZERO) ? -1 : 1;
  ns = abs(ns);
  let microsBI = ZERO;
  let millisBI = ZERO;
  let secondsBI = ZERO;
  let minutesBI = ZERO;
  let hoursBI = ZERO;
  const THOUSAND = JSBI.BigInt(1000);
  const SIXTY = JSBI.BigInt(60);
  switch (largestUnit) {
    case 'year':
    case 'month':
    case 'week':
    case 'day':
    case 'hour':
      ({ quotient: microsBI, remainder: ns } = divmod(ns, THOUSAND));
      ({ quotient: millisBI, remainder: microsBI } = divmod(microsBI, THOUSAND));
      ({ quotient: secondsBI, remainder: millisBI } = divmod(millisBI, THOUSAND));
      ({ quotient: minutesBI, remainder: secondsBI } = divmod(secondsBI, SIXTY));
      ({ quotient: hoursBI, remainder: minutesBI } = divmod(minutesBI, SIXTY));
      break;
    case 'minute':
      ({ quotient: microsBI, remainder: ns } = divmod(ns, THOUSAND));
      ({ quotient: millisBI, remainder: microsBI } = divmod(microsBI, THOUSAND));
      ({ quotient: secondsBI, remainder: millisBI } = divmod(millisBI, THOUSAND));
      ({ quotient: minutesBI, remainder: secondsBI } = divmod(secondsBI, SIXTY));
      break;
    case 'second':
      ({ quotient: microsBI, remainder: ns } = divmod(ns, THOUSAND));
      ({ quotient: millisBI, remainder: microsBI } = divmod(microsBI, THOUSAND));
      ({ quotient: secondsBI, remainder: millisBI } = divmod(millisBI, THOUSAND));
      break;
    case 'millisecond':
      ({ quotient: microsBI, remainder: ns } = divmod(ns, THOUSAND));
      ({ quotient: millisBI, remainder: microsBI } = divmod(microsBI, THOUSAND));
      break;
    case 'microsecond':
      ({ quotient: microsBI, remainder: ns } = divmod(ns, THOUSAND));
      break;
    case 'nanosecond':
      break;
    default:
      throw new Error('assert not reached');
  }
  return {
    days,
    hours: JSBI.toNumber(hoursBI) * sign,
    minutes: JSBI.toNumber(minutesBI) * sign,
    seconds: JSBI.toNumber(secondsBI) * sign,
    milliseconds: JSBI.toNumber(millisBI) * sign,
    microseconds: JSBI.toNumber(microsBI) * sign,
    nanoseconds: JSBI.toNumber(ns) * sign,
  };
}

export function UnbalanceDurationRelative(years: number, months: number, weeks: number, days: number, largestUnit, relativeTo) {
  const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
  const sign = DurationSign(years, months, weeks, days, 0, 0, 0, 0, 0, 0);

  let calendar;
  if (relativeTo) {
    relativeTo = ToTemporalDateTime(relativeTo);
    calendar = GetSlot(relativeTo, CALENDAR);
  }

  const oneYear = new TemporalDuration(sign);
  const oneMonth = new TemporalDuration(0, sign);
  const oneWeek = new TemporalDuration(0, 0, sign);

  switch (largestUnit) {
    case 'year':
      // no-op
      break;
    case 'month':
      {
        if (!calendar) throw new RangeError('a starting point is required for months balancing');
        // balance years down to months
        const dateAdd = calendar.dateAdd;
        const dateUntil = calendar.dateUntil;
        while (MathAbs(years) > 0) {
          const addOptions = ObjectCreate(null);
          const newRelativeTo = CalendarDateAdd(calendar, relativeTo, oneYear, addOptions, dateAdd);
          const untilOptions = ObjectCreate(null);
          untilOptions.largestUnit = 'month';
          const untilResult = CalendarDateUntil(calendar, relativeTo, newRelativeTo, untilOptions, dateUntil);
          const oneYearMonths = GetSlot(untilResult, MONTHS);
          relativeTo = newRelativeTo;
          months += oneYearMonths;
          years -= sign;
        }
      }
      break;
    case 'week':
      if (!calendar) throw new RangeError('a starting point is required for weeks balancing');
      // balance years down to days
      while (MathAbs(years) > 0) {
        let oneYearDays;
        ({ relativeTo, days: oneYearDays } = MoveRelativeDate(calendar, relativeTo, oneYear));
        days += oneYearDays;
        years -= sign;
      }

      // balance months down to days
      while (MathAbs(months) > 0) {
        let oneMonthDays;
        ({ relativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
        days += oneMonthDays;
        months -= sign;
      }
      break;
    default:
      // balance years down to days
      while (MathAbs(years) > 0) {
        if (!calendar) throw new RangeError('a starting point is required for balancing calendar units');
        let oneYearDays;
        ({ relativeTo, days: oneYearDays } = MoveRelativeDate(calendar, relativeTo, oneYear));
        days += oneYearDays;
        years -= sign;
      }

      // balance months down to days
      while (MathAbs(months) > 0) {
        if (!calendar) throw new RangeError('a starting point is required for balancing calendar units');
        let oneMonthDays;
        ({ relativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
        days += oneMonthDays;
        months -= sign;
      }

      // balance weeks down to days
      while (MathAbs(weeks) > 0) {
        if (!calendar) throw new RangeError('a starting point is required for balancing calendar units');
        let oneWeekDays;
        ({ relativeTo, days: oneWeekDays } = MoveRelativeDate(calendar, relativeTo, oneWeek));
        days += oneWeekDays;
        weeks -= sign;
      }
      break;
  }

  return { years, months, weeks, days };
}

export function BalanceDurationRelative(years, months, weeks, days, largestUnit, relativeTo) {
  const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
  const sign = DurationSign(years, months, weeks, days, 0, 0, 0, 0, 0, 0);
  if (sign === 0) return { years, months, weeks, days };

  let calendar;
  if (relativeTo) {
    relativeTo = ToTemporalDateTime(relativeTo);
    calendar = GetSlot(relativeTo, CALENDAR);
  }

  const oneYear = new TemporalDuration(sign);
  const oneMonth = new TemporalDuration(0, sign);
  const oneWeek = new TemporalDuration(0, 0, sign);

  switch (largestUnit) {
    case 'year': {
      if (!calendar) throw new RangeError('a starting point is required for years balancing');
      // balance days up to years
      let newRelativeTo, oneYearDays;
      ({ relativeTo: newRelativeTo, days: oneYearDays } = MoveRelativeDate(calendar, relativeTo, oneYear));
      while (MathAbs(days) >= MathAbs(oneYearDays)) {
        days -= oneYearDays;
        years += sign;
        relativeTo = newRelativeTo;
        ({ relativeTo: newRelativeTo, days: oneYearDays } = MoveRelativeDate(calendar, relativeTo, oneYear));
      }

      // balance days up to months
      let oneMonthDays;
      ({ relativeTo: newRelativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
      while (MathAbs(days) >= MathAbs(oneMonthDays)) {
        days -= oneMonthDays;
        months += sign;
        relativeTo = newRelativeTo;
        ({ relativeTo: newRelativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
      }

      // balance months up to years
      const dateAdd = calendar.dateAdd;
      const addOptions = ObjectCreate(null);
      newRelativeTo = CalendarDateAdd(calendar, relativeTo, oneYear, addOptions, dateAdd);
      const dateUntil = calendar.dateUntil;
      const untilOptions = ObjectCreate(null);
      untilOptions.largestUnit = 'month';
      let untilResult = CalendarDateUntil(calendar, relativeTo, newRelativeTo, untilOptions, dateUntil);
      let oneYearMonths = GetSlot(untilResult, MONTHS);
      while (MathAbs(months) >= MathAbs(oneYearMonths)) {
        months -= oneYearMonths;
        years += sign;
        relativeTo = newRelativeTo;
        const addOptions = ObjectCreate(null);
        newRelativeTo = CalendarDateAdd(calendar, relativeTo, oneYear, addOptions, dateAdd);
        const untilOptions = ObjectCreate(null);
        untilOptions.largestUnit = 'month';
        untilResult = CalendarDateUntil(calendar, relativeTo, newRelativeTo, untilOptions, dateUntil);
        oneYearMonths = GetSlot(untilResult, MONTHS);
      }
      break;
    }
    case 'month': {
      if (!calendar) throw new RangeError('a starting point is required for months balancing');
      // balance days up to months
      let newRelativeTo, oneMonthDays;
      ({ relativeTo: newRelativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
      while (MathAbs(days) >= MathAbs(oneMonthDays)) {
        days -= oneMonthDays;
        months += sign;
        relativeTo = newRelativeTo;
        ({ relativeTo: newRelativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
      }
      break;
    }
    case 'week': {
      if (!calendar) throw new RangeError('a starting point is required for weeks balancing');
      // balance days up to weeks
      let newRelativeTo, oneWeekDays;
      ({ relativeTo: newRelativeTo, days: oneWeekDays } = MoveRelativeDate(calendar, relativeTo, oneWeek));
      while (MathAbs(days) >= MathAbs(oneWeekDays)) {
        days -= oneWeekDays;
        weeks += sign;
        relativeTo = newRelativeTo;
        ({ relativeTo: newRelativeTo, days: oneWeekDays } = MoveRelativeDate(calendar, relativeTo, oneWeek));
      }
      break;
    }
    default:
      // no-op
      break;
  }

  return { years, months, weeks, days };
}

export function CalculateOffsetShift(relativeTo, y, mon, w, d, h, min, s, ms, µs, ns) {
  if (IsTemporalZonedDateTime(relativeTo)) {
    const instant = GetSlot(relativeTo, INSTANT);
    const timeZone = GetSlot(relativeTo, TIME_ZONE);
    const calendar = GetSlot(relativeTo, CALENDAR);
    const offsetBefore = GetOffsetNanosecondsFor(timeZone, instant);
    const after = AddZonedDateTime(instant, timeZone, calendar, y, mon, w, d, h, min, s, ms, µs, ns);
    const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
    const instantAfter = new TemporalInstant(after);
    const offsetAfter = GetOffsetNanosecondsFor(timeZone, instantAfter);
    return offsetAfter - offsetBefore;
  }
  return 0;
}

export function CreateNegatedTemporalDuration(duration) {
  const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
  return new TemporalDuration(
    -GetSlot(duration, YEARS),
    -GetSlot(duration, MONTHS),
    -GetSlot(duration, WEEKS),
    -GetSlot(duration, DAYS),
    -GetSlot(duration, HOURS),
    -GetSlot(duration, MINUTES),
    -GetSlot(duration, SECONDS),
    -GetSlot(duration, MILLISECONDS),
    -GetSlot(duration, MICROSECONDS),
    -GetSlot(duration, NANOSECONDS)
  );
}

export function ConstrainToRange(value, min, max) {
  return MathMin(max, MathMax(min, value));
}
function ConstrainISODate(year, month, day?: any) {
  month = ConstrainToRange(month, 1, 12);
  day = ConstrainToRange(day, 1, ISODaysInMonth(year, month));
  return { year, month, day };
}

function ConstrainTime(hour, minute, second, millisecond, microsecond, nanosecond) {
  hour = ConstrainToRange(hour, 0, 23);
  minute = ConstrainToRange(minute, 0, 59);
  second = ConstrainToRange(second, 0, 59);
  millisecond = ConstrainToRange(millisecond, 0, 999);
  microsecond = ConstrainToRange(microsecond, 0, 999);
  nanosecond = ConstrainToRange(nanosecond, 0, 999);
  return { hour, minute, second, millisecond, microsecond, nanosecond };
}

export function RejectToRange(value, min, max) {
  if (value < min || value > max) throw new RangeError(`value out of range: ${min} <= ${value} <= ${max}`);
}

function RejectISODate(year, month, day) {
  RejectToRange(month, 1, 12);
  RejectToRange(day, 1, ISODaysInMonth(year, month));
}

function RejectDateRange(year, month, day) {
  // Noon avoids trouble at edges of DateTime range (excludes midnight)
  RejectDateTimeRange(year, month, day, 12, 0, 0, 0, 0, 0);
}

export function RejectTime(hour, minute, second, millisecond, microsecond, nanosecond) {
  RejectToRange(hour, 0, 23);
  RejectToRange(minute, 0, 59);
  RejectToRange(second, 0, 59);
  RejectToRange(millisecond, 0, 999);
  RejectToRange(microsecond, 0, 999);
  RejectToRange(nanosecond, 0, 999);
}

function RejectDateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond) {
  RejectISODate(year, month, day);
  RejectTime(hour, minute, second, millisecond, microsecond, nanosecond);
}

function RejectDateTimeRange(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond) {
  RejectToRange(year, YEAR_MIN, YEAR_MAX);
  // Reject any DateTime 24 hours or more outside the Instant range
  if (
    (year === YEAR_MIN &&
      null ==
        GetEpochFromISOParts(year, month, day + 1, hour, minute, second, millisecond, microsecond, nanosecond - 1)) ||
    (year === YEAR_MAX &&
      null ==
        GetEpochFromISOParts(year, month, day - 1, hour, minute, second, millisecond, microsecond, nanosecond + 1))
  ) {
    throw new RangeError('DateTime outside of supported range');
  }
}

export function ValidateEpochNanoseconds(epochNanoseconds: JSBI) {
  if (JSBI.lessThan(epochNanoseconds, NS_MIN) || JSBI.greaterThan(epochNanoseconds, NS_MAX)) {
    throw new RangeError('Instant outside of supported range');
  }
}

function RejectYearMonthRange(year, month) {
  RejectToRange(year, YEAR_MIN, YEAR_MAX);
  if (year === YEAR_MIN) {
    RejectToRange(month, 4, 12);
  } else if (year === YEAR_MAX) {
    RejectToRange(month, 1, 9);
  }
}

function RejectDuration(y, mon, w, d, h, min, s, ms, µs, ns) {
  const sign = DurationSign(y, mon, w, d, h, min, s, ms, µs, ns);
  for (const prop of [y, mon, w, d, h, min, s, ms, µs, ns]) {
    if (!NumberIsFinite(prop)) throw new RangeError('infinite values not allowed as duration fields');
    const propSign = MathSign(prop);
    if (propSign !== 0 && propSign !== sign) throw new RangeError('mixed-sign values not allowed as duration fields');
  }
}

export function DifferenceISODate(y1, m1, d1, y2, m2, d2, largestUnit = 'days') {
  switch (largestUnit) {
    case 'year':
    case 'month': {
      const sign = -CompareISODate(y1, m1, d1, y2, m2, d2);
      if (sign === 0) return { years: 0, months: 0, weeks: 0, days: 0 };

      const start = { year: y1, month: m1, day: d1 };
      const end = { year: y2, month: m2, day: d2 };

      let years = end.year - start.year;
      let mid = AddISODate(y1, m1, d1, years, 0, 0, 0, 'constrain');
      let midSign = -CompareISODate(mid.year, mid.month, mid.day, y2, m2, d2);
      if (midSign === 0) {
        return largestUnit === 'year'
          ? { years, months: 0, weeks: 0, days: 0 }
          : { years: 0, months: years * 12, weeks: 0, days: 0 };
      }
      let months = end.month - start.month;
      if (midSign !== sign) {
        years -= sign;
        months += sign * 12;
      }
      mid = AddISODate(y1, m1, d1, years, months, 0, 0, 'constrain');
      midSign = -CompareISODate(mid.year, mid.month, mid.day, y2, m2, d2);
      if (midSign === 0) {
        return largestUnit === 'year'
          ? { years, months, weeks: 0, days: 0 }
          : { years: 0, months: months + years * 12, weeks: 0, days: 0 };
      }
      if (midSign !== sign) {
        // The end date is later in the month than mid date (or earlier for
        // negative durations). Back up one month.
        months -= sign;
        if (months === -sign) {
          years -= sign;
          months = 11 * sign;
        }
        mid = AddISODate(y1, m1, d1, years, months, 0, 0, 'constrain');
        midSign = -CompareISODate(y1, m1, d1, mid.year, mid.month, mid.day);
      }

      let days = 0;
      // If we get here, months and years are correct (no overflow), and `mid`
      // is within the range from `start` to `end`. To count the days between
      // `mid` and `end`, there are 3 cases:
      // 1) same month: use simple subtraction
      // 2) end is previous month from intermediate (negative duration)
      // 3) end is next month from intermediate (positive duration)
      if (mid.month === end.month) {
        // 1) same month: use simple subtraction
        days = end.day - mid.day;
      } else if (sign < 0) {
        // 2) end is previous month from intermediate (negative duration)
        // Example: intermediate: Feb 1, end: Jan 30, DaysInMonth = 31, days = -2
        days = -mid.day - (ISODaysInMonth(end.year, end.month) - end.day);
      } else {
        // 3) end is next month from intermediate (positive duration)
        // Example: intermediate: Jan 29, end: Feb 1, DaysInMonth = 31, days = 3
        days = end.day + (ISODaysInMonth(mid.year, mid.month) - mid.day);
      }

      if (largestUnit === 'month') {
        months += years * 12;
        years = 0;
      }
      return { years, months, weeks: 0, days };
    }
    case 'week':
    case 'day': {
      let larger, smaller, sign;
      if (CompareISODate(y1, m1, d1, y2, m2, d2) < 0) {
        smaller = { year: y1, month: m1, day: d1 };
        larger = { year: y2, month: m2, day: d2 };
        sign = 1;
      } else {
        smaller = { year: y2, month: m2, day: d2 };
        larger = { year: y1, month: m1, day: d1 };
        sign = -1;
      }
      let days = DayOfYear(larger.year, larger.month, larger.day) - DayOfYear(smaller.year, smaller.month, smaller.day);
      for (let year = smaller.year; year < larger.year; ++year) {
        days += LeapYear(year) ? 366 : 365;
      }
      let weeks = 0;
      if (largestUnit === 'week') {
        weeks = MathFloor(days / 7);
        days %= 7;
      }
      weeks *= sign;
      days *= sign;
      return { years: 0, months: 0, weeks, days };
    }
    default:
      throw new Error('assert not reached');
  }
}

export function DifferenceTime(h1, min1, s1, ms1, µs1, ns1, h2, min2, s2, ms2, µs2, ns2) {
  let hours = h2 - h1;
  let minutes = min2 - min1;
  let seconds = s2 - s1;
  let milliseconds = ms2 - ms1;
  let microseconds = µs2 - µs1;
  let nanoseconds = ns2 - ns1;

  const sign = DurationSign(0, 0, 0, 0, hours, minutes, seconds, milliseconds, microseconds, nanoseconds);
  hours *= sign;
  minutes *= sign;
  seconds *= sign;
  milliseconds *= sign;
  microseconds *= sign;
  nanoseconds *= sign;

  let deltaDays = 0;
  ({
    deltaDays,
    hour: hours,
    minute: minutes,
    second: seconds,
    millisecond: milliseconds,
    microsecond: microseconds,
    nanosecond: nanoseconds
  } = BalanceTime(hours, minutes, seconds, milliseconds, microseconds, nanoseconds));

  deltaDays *= sign;
  hours *= sign;
  minutes *= sign;
  seconds *= sign;
  milliseconds *= sign;
  microseconds *= sign;
  nanoseconds *= sign;

  return { deltaDays, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
}

export function DifferenceInstant(ns1: JSBI, ns2: JSBI, increment: number, unit: keyof typeof nsPerTimeUnit, roundingMode: Temporal.RoundingMode): {
  seconds: number;
  milliseconds: number;
  microseconds: number;
  nanoseconds: number;
} {
  const diff = JSBI.subtract(ns2, ns1);

  const remainder = JSBI.remainder(diff, JSBI.BigInt(86400e9));
  const wholeDays = JSBI.subtract(diff, remainder);
  const roundedRemainder = RoundNumberToIncrement(remainder, nsPerTimeUnit[unit] * increment, roundingMode);
  const roundedDiff = JSBI.add(wholeDays, roundedRemainder);

  const nanoseconds = JSBI.toNumber(JSBI.remainder(roundedDiff, JSBI.BigInt(1e3)));
  const microseconds = JSBI.toNumber(JSBI.remainder(JSBI.divide(roundedDiff, JSBI.BigInt(1e3)), JSBI.BigInt(1e3)));
  const milliseconds = JSBI.toNumber(JSBI.remainder(JSBI.divide(roundedDiff, JSBI.BigInt(1e6)), JSBI.BigInt(1e3)));
  const seconds = JSBI.toNumber(JSBI.divide(roundedDiff, JSBI.BigInt(1e9)));
  return { seconds, milliseconds, microseconds, nanoseconds };
}

export function DifferenceISODateTime(
  y1,
  mon1,
  d1,
  h1,
  min1,
  s1,
  ms1,
  µs1,
  ns1,
  y2,
  mon2,
  d2,
  h2,
  min2,
  s2,
  ms2,
  µs2,
  ns2,
  calendar,
  largestUnit,
  options = ObjectCreate(null)
) {
  let { deltaDays, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = DifferenceTime(
    h1,
    min1,
    s1,
    ms1,
    µs1,
    ns1,
    h2,
    min2,
    s2,
    ms2,
    µs2,
    ns2
  );

  const timeSign = DurationSign(0, 0, 0, deltaDays, hours, minutes, seconds, milliseconds, microseconds, nanoseconds);
  ({ year: y1, month: mon1, day: d1 } = BalanceISODate(y1, mon1, d1 + deltaDays));
  const dateSign = CompareISODate(y2, mon2, d2, y1, mon1, d1);
  if (dateSign === -timeSign) {
    ({ year: y1, month: mon1, day: d1 } = BalanceISODate(y1, mon1, d1 - timeSign));
    ({ hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = BalanceDuration(
      -timeSign,
      hours,
      minutes,
      seconds,
      milliseconds,
      microseconds,
      nanoseconds,
      largestUnit
    ));
  }

  const date1 = CreateTemporalDate(y1, mon1, d1, calendar);
  const date2 = CreateTemporalDate(y2, mon2, d2, calendar);
  const dateLargestUnit = LargerOfTwoTemporalUnits('day', largestUnit);
  const untilOptions = { ...options, largestUnit: dateLargestUnit };
  let { years, months, weeks, days } = CalendarDateUntil(calendar, date1, date2, untilOptions);
  // Signs of date part and time part may not agree; balance them together
  ({ days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = BalanceDuration(
    days,
    hours,
    minutes,
    seconds,
    milliseconds,
    microseconds,
    nanoseconds,
    largestUnit
  ));
  return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
}

export function DifferenceZonedDateTime(ns1: JSBI, ns2: JSBI, timeZone, calendar, largestUnit, options?: any) {
  const nsDiff = JSBI.subtract(ns2, ns1);
  if (JSBI.equal(nsDiff, ZERO)) {
    return {
      years: 0,
      months: 0,
      weeks: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
      microseconds: 0,
      nanoseconds: 0
    };
  }

  // Find the difference in dates only.
  const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
  const start = new TemporalInstant(ns1);
  const end = new TemporalInstant(ns2);
  const dtStart = BuiltinTimeZoneGetPlainDateTimeFor(timeZone, start, calendar);
  const dtEnd = BuiltinTimeZoneGetPlainDateTimeFor(timeZone, end, calendar);
  let { years, months, weeks, days } = DifferenceISODateTime(
    GetSlot(dtStart, ISO_YEAR),
    GetSlot(dtStart, ISO_MONTH),
    GetSlot(dtStart, ISO_DAY),
    GetSlot(dtStart, ISO_HOUR),
    GetSlot(dtStart, ISO_MINUTE),
    GetSlot(dtStart, ISO_SECOND),
    GetSlot(dtStart, ISO_MILLISECOND),
    GetSlot(dtStart, ISO_MICROSECOND),
    GetSlot(dtStart, ISO_NANOSECOND),
    GetSlot(dtEnd, ISO_YEAR),
    GetSlot(dtEnd, ISO_MONTH),
    GetSlot(dtEnd, ISO_DAY),
    GetSlot(dtEnd, ISO_HOUR),
    GetSlot(dtEnd, ISO_MINUTE),
    GetSlot(dtEnd, ISO_SECOND),
    GetSlot(dtEnd, ISO_MILLISECOND),
    GetSlot(dtEnd, ISO_MICROSECOND),
    GetSlot(dtEnd, ISO_NANOSECOND),
    calendar,
    largestUnit,
    options
  );
  const intermediateNs = AddZonedDateTime(start, timeZone, calendar, years, months, weeks, 0, 0, 0, 0, 0, 0, 0);
  // may disambiguate
  let timeRemainderNs = JSBI.subtract(ns2, intermediateNs);
  const intermediate = CreateTemporalZonedDateTime(intermediateNs, timeZone, calendar);
  ({ nanoseconds: timeRemainderNs, days } = NanosecondsToDays(timeRemainderNs, intermediate));

  // Finally, merge the date and time durations and return the merged result.
  const { hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = BalanceDuration(
    0,
    0,
    0,
    0,
    0,
    0,
    JSBI.toNumber(timeRemainderNs),
    'hour'
  );
  return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
}

export function AddISODate(year, month, day, years, months, weeks, days, overflow) {
  year += years;
  month += months;
  ({ year, month } = BalanceISOYearMonth(year, month));
  ({ year, month, day } = RegulateISODate(year, month, day, overflow));
  days += 7 * weeks;
  day += days;
  ({ year, month, day } = BalanceISODate(year, month, day));
  return { year, month, day };
}

export function AddTime(
  hour,
  minute,
  second,
  millisecond,
  microsecond,
  nanosecond,
  hours,
  minutes,
  seconds,
  milliseconds,
  microseconds,
  nanoseconds
) {
  hour += hours;
  minute += minutes;
  second += seconds;
  millisecond += milliseconds;
  microsecond += microseconds;
  nanosecond += nanoseconds;
  let deltaDays = 0;
  ({ deltaDays, hour, minute, second, millisecond, microsecond, nanosecond } = BalanceTime(
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond
  ));
  return { deltaDays, hour, minute, second, millisecond, microsecond, nanosecond };
}

export function AddDuration(
  y1,
  mon1,
  w1,
  d1,
  h1,
  min1,
  s1,
  ms1,
  µs1,
  ns1,
  y2,
  mon2,
  w2,
  d2,
  h2,
  min2,
  s2,
  ms2,
  µs2,
  ns2,
  relativeTo
) {
  const largestUnit1 = DefaultTemporalLargestUnit(y1, mon1, w1, d1, h1, min1, s1, ms1, µs1, ns1);
  const largestUnit2 = DefaultTemporalLargestUnit(y2, mon2, w2, d2, h2, min2, s2, ms2, µs2, ns2);
  const largestUnit = LargerOfTwoTemporalUnits(largestUnit1, largestUnit2);

  let years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds;
  if (!relativeTo) {
    if (largestUnit === 'year' || largestUnit === 'month' || largestUnit === 'week') {
      throw new RangeError('relativeTo is required for years, months, or weeks arithmetic');
    }
    years = months = weeks = 0;
    ({ days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = BalanceDuration(
      d1 + d2,
      h1 + h2,
      min1 + min2,
      s1 + s2,
      ms1 + ms2,
      µs1 + µs2,
      ns1 + ns2,
      largestUnit
    ));
  } else if (IsTemporalDateTime(relativeTo)) {
    const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
    const calendar = GetSlot(relativeTo, CALENDAR);

    const datePart = CreateTemporalDate(
      GetSlot(relativeTo, ISO_YEAR),
      GetSlot(relativeTo, ISO_MONTH),
      GetSlot(relativeTo, ISO_DAY),
      calendar
    );
    const dateDuration1 = new TemporalDuration(y1, mon1, w1, d1, 0, 0, 0, 0, 0, 0);
    const dateDuration2 = new TemporalDuration(y2, mon2, w2, d2, 0, 0, 0, 0, 0, 0);
    const dateAdd = calendar.dateAdd;
    const firstAddOptions = ObjectCreate(null);
    const intermediate = CalendarDateAdd(calendar, datePart, dateDuration1, firstAddOptions, dateAdd);
    const secondAddOptions = ObjectCreate(null);
    const end = CalendarDateAdd(calendar, intermediate, dateDuration2, secondAddOptions, dateAdd);

    const dateLargestUnit = LargerOfTwoTemporalUnits('day', largestUnit);
    const differenceOptions = ObjectCreate(null);
    differenceOptions.largestUnit = dateLargestUnit;
    ({ years, months, weeks, days } = CalendarDateUntil(calendar, datePart, end, differenceOptions));
    // Signs of date part and time part may not agree; balance them together
    ({ days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = BalanceDuration(
      days,
      h1 + h2,
      min1 + min2,
      s1 + s2,
      ms1 + ms2,
      µs1 + µs2,
      ns1 + ns2,
      largestUnit
    ));
  } else {
    // relativeTo is a ZonedDateTime
    const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
    const timeZone = GetSlot(relativeTo, TIME_ZONE);
    const calendar = GetSlot(relativeTo, CALENDAR);
    const intermediateNs = AddZonedDateTime(
      GetSlot(relativeTo, INSTANT),
      timeZone,
      calendar,
      y1,
      mon1,
      w1,
      d1,
      h1,
      min1,
      s1,
      ms1,
      µs1,
      ns1
    );
    const endNs = AddZonedDateTime(
      new TemporalInstant(intermediateNs),
      timeZone,
      calendar,
      y2,
      mon2,
      w2,
      d2,
      h2,
      min2,
      s2,
      ms2,
      µs2,
      ns2
    );
    if (largestUnit !== 'year' && largestUnit !== 'month' && largestUnit !== 'week' && largestUnit !== 'day') {
      // The user is only asking for a time difference, so return difference of instants.
      years = 0;
      months = 0;
      weeks = 0;
      days = 0;
      ({ seconds, milliseconds, microseconds, nanoseconds } = DifferenceInstant(
        GetSlot(relativeTo, EPOCHNANOSECONDS),
        endNs,
        1,
        'nanosecond',
        'halfExpand'
      ));
      ({ hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = BalanceDuration(
        0,
        0,
        0,
        seconds,
        milliseconds,
        microseconds,
        nanoseconds,
        largestUnit
      ));
    } else {
      ({ years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } =
        DifferenceZonedDateTime(GetSlot(relativeTo, EPOCHNANOSECONDS), endNs, timeZone, calendar, largestUnit));
    }
  }

  RejectDuration(years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds);
  return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
}

export function AddInstant(epochNanoseconds, h, min, s, ms, µs, ns) {
  let sum = ZERO;
  sum = JSBI.add(sum, JSBI.BigInt(ns));
  sum = JSBI.add(sum, JSBI.multiply(JSBI.BigInt(µs), JSBI.BigInt(1e3)));
  sum = JSBI.add(sum, JSBI.multiply(JSBI.BigInt(ms), JSBI.BigInt(1e6)));
  sum = JSBI.add(sum, JSBI.multiply(JSBI.BigInt(s), JSBI.BigInt(1e9)));
  sum = JSBI.add(sum, JSBI.multiply(JSBI.BigInt(min), JSBI.BigInt(60 * 1e9)));
  sum = JSBI.add(sum, JSBI.multiply(JSBI.BigInt(h), JSBI.BigInt(60 * 60 * 1e9)));

  const result = JSBI.add(epochNanoseconds, sum);
  ValidateEpochNanoseconds(result);
  return result;
}

export function AddDateTime(
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
  microsecond,
  nanosecond,
  calendar,
  years,
  months,
  weeks,
  days,
  hours,
  minutes,
  seconds,
  milliseconds,
  microseconds,
  nanoseconds,
  options
) {
  // Add the time part
  let deltaDays = 0;
  ({ deltaDays, hour, minute, second, millisecond, microsecond, nanosecond } = AddTime(
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond,
    hours,
    minutes,
    seconds,
    milliseconds,
    microseconds,
    nanoseconds
  ));
  days += deltaDays;

  // Delegate the date part addition to the calendar
  const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
  const datePart = CreateTemporalDate(year, month, day, calendar);
  const dateDuration = new TemporalDuration(years, months, weeks, days, 0, 0, 0, 0, 0, 0);
  const addedDate = CalendarDateAdd(calendar, datePart, dateDuration, options);

  return {
    year: GetSlot(addedDate, ISO_YEAR),
    month: GetSlot(addedDate, ISO_MONTH),
    day: GetSlot(addedDate, ISO_DAY),
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond
  };
}

export function AddZonedDateTime(
  instant,
  timeZone,
  calendar,
  years,
  months,
  weeks,
  days,
  h,
  min,
  s,
  ms,
  µs,
  ns,
  options?: any
) {
  // If only time is to be added, then use Instant math. It's not OK to fall
  // through to the date/time code below because compatible disambiguation in
  // the PlainDateTime=>Instant conversion will change the offset of any
  // ZonedDateTime in the repeated clock time after a backwards transition.
  // When adding/subtracting time units and not dates, this disambiguation is
  // not expected and so is avoided below via a fast path for time-only
  // arithmetic.
  // BTW, this behavior is similar in spirit to offset: 'prefer' in `with`.
  const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
  if (DurationSign(years, months, weeks, days, 0, 0, 0, 0, 0, 0) === 0) {
    return AddInstant(GetSlot(instant, EPOCHNANOSECONDS), h, min, s, ms, µs, ns);
  }

  // RFC 5545 requires the date portion to be added in calendar days and the
  // time portion to be added in exact time.
  const dt = BuiltinTimeZoneGetPlainDateTimeFor(timeZone, instant, calendar);
  const datePart = CreateTemporalDate(GetSlot(dt, ISO_YEAR), GetSlot(dt, ISO_MONTH), GetSlot(dt, ISO_DAY), calendar);
  const dateDuration = new TemporalDuration(years, months, weeks, days, 0, 0, 0, 0, 0, 0);
  const addedDate = CalendarDateAdd(calendar, datePart, dateDuration, options);
  const dtIntermediate = CreateTemporalDateTime(
    GetSlot(addedDate, ISO_YEAR),
    GetSlot(addedDate, ISO_MONTH),
    GetSlot(addedDate, ISO_DAY),
    GetSlot(dt, ISO_HOUR),
    GetSlot(dt, ISO_MINUTE),
    GetSlot(dt, ISO_SECOND),
    GetSlot(dt, ISO_MILLISECOND),
    GetSlot(dt, ISO_MICROSECOND),
    GetSlot(dt, ISO_NANOSECOND),
    calendar
  );

  // Note that 'compatible' is used below because this disambiguation behavior
  // is required by RFC 5545.
  const instantIntermediate = BuiltinTimeZoneGetInstantFor(timeZone, dtIntermediate, 'compatible');
  return AddInstant(GetSlot(instantIntermediate, EPOCHNANOSECONDS), h, min, s, ms, µs, ns);
}

function RoundNumberToIncrement(quantity: JSBI, increment: number, mode: Temporal.RoundingMode) {
  if (increment === 1) return quantity;
  let { quotient, remainder } = divmod(quantity, JSBI.BigInt(increment));
  if (JSBI.equal(remainder, ZERO)) return quantity;
  const sign = JSBI.lessThan(remainder, ZERO) ? -1 : 1;
  switch (mode) {
    case 'ceil':
      if (sign > 0) quotient = JSBI.add(quotient, JSBI.BigInt(sign));
      break;
    case 'floor':
      if (sign < 0) quotient = JSBI.add(quotient, JSBI.BigInt(sign));
      break;
    case 'trunc':
      // no change needed, because divmod is a truncation
      break;
    case 'halfExpand':
      // "half up away from zero"
      if (JSBI.toNumber(abs(JSBI.multiply(remainder, JSBI.BigInt(2)))) >= increment) quotient = JSBI.add(quotient, JSBI.BigInt(sign));
      break;
  }
  return JSBI.multiply(quotient, JSBI.BigInt(increment));
}

export function RoundInstant(epochNs: JSBI, increment: number, unit: keyof typeof nsPerTimeUnit, roundingMode: Temporal.RoundingMode): JSBI {
  // Note: NonNegativeModulo, but with BigInt
  let remainder = JSBI.remainder(epochNs, JSBI.BigInt(86400e9));
  if (JSBI.lessThan(remainder, ZERO)) remainder = JSBI.add(remainder, JSBI.BigInt(86400e9));
  const wholeDays = JSBI.subtract(epochNs, remainder);
  const roundedRemainder = RoundNumberToIncrement(remainder, nsPerTimeUnit[unit] * increment, roundingMode);
  return JSBI.add(wholeDays, roundedRemainder);
}

export function RoundISODateTime(
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
  microsecond,
  nanosecond,
  increment,
  unit,
  roundingMode,
  dayLengthNs = 86400e9
) {
  let deltaDays = 0;
  ({ deltaDays, hour, minute, second, millisecond, microsecond, nanosecond } = RoundTime(
    hour,
    minute,
    second,
    millisecond,
    microsecond,
    nanosecond,
    increment,
    unit,
    roundingMode,
    dayLengthNs
  ));
  ({ year, month, day } = BalanceISODate(year, month, day + deltaDays));
  return { year, month, day, hour, minute, second, millisecond, microsecond, nanosecond };
}

export function RoundTime(
  hour,
  minute,
  second,
  millisecond,
  microsecond,
  nanosecond,
  increment,
  unit,
  roundingMode,
  dayLengthNs = 86400e9
) {
  let quantity = ZERO;
  switch (unit) {
    case 'day':
    case 'hour':
      quantity = JSBI.BigInt(hour);
    // fall through
    case 'minute':
      quantity = JSBI.add(JSBI.multiply(quantity, JSBI.BigInt(60)), JSBI.BigInt(minute));
    // fall through
    case 'second':
      quantity = JSBI.add(JSBI.multiply(quantity, JSBI.BigInt(60)), JSBI.BigInt(second));
    // fall through
    case 'millisecond':
      quantity = JSBI.add(JSBI.multiply(quantity, JSBI.BigInt(1000)), JSBI.BigInt(millisecond));
    // fall through
    case 'microsecond':
      quantity = JSBI.add(JSBI.multiply(quantity, JSBI.BigInt(1000)), JSBI.BigInt(microsecond));
    // fall through
    case 'nanosecond':
      quantity = JSBI.add(JSBI.multiply(quantity, JSBI.BigInt(1000)), JSBI.BigInt(nanosecond));
  }
  const nsPerUnit = unit === 'day' ? dayLengthNs : nsPerTimeUnit[unit];
  const rounded = RoundNumberToIncrement(quantity, nsPerUnit * increment, roundingMode);
  const result = JSBI.toNumber(JSBI.divide(rounded, JSBI.BigInt(nsPerUnit)));
  switch (unit) {
    case 'day':
      return { deltaDays: result, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 };
    case 'hour':
      return BalanceTime(result, 0, 0, 0, 0, 0);
    case 'minute':
      return BalanceTime(hour, result, 0, 0, 0, 0);
    case 'second':
      return BalanceTime(hour, minute, result, 0, 0, 0);
    case 'millisecond':
      return BalanceTime(hour, minute, second, result, 0, 0);
    case 'microsecond':
      return BalanceTime(hour, minute, second, millisecond, result, 0);
    case 'nanosecond':
      return BalanceTime(hour, minute, second, millisecond, microsecond, result);
    default:
      throw new Error(`Invalid unit ${unit}`);
  }
}

function DaysUntil(earlier, later) {
  return DifferenceISODate(
    GetSlot(earlier, ISO_YEAR),
    GetSlot(earlier, ISO_MONTH),
    GetSlot(earlier, ISO_DAY),
    GetSlot(later, ISO_YEAR),
    GetSlot(later, ISO_MONTH),
    GetSlot(later, ISO_DAY),
    'day'
  ).days;
}

function MoveRelativeDate(calendar, relativeTo, duration) {
  const options = ObjectCreate(null);
  const later = CalendarDateAdd(calendar, relativeTo, duration, options);
  const days = DaysUntil(relativeTo, later);
  relativeTo = CreateTemporalDateTime(
    GetSlot(later, ISO_YEAR),
    GetSlot(later, ISO_MONTH),
    GetSlot(later, ISO_DAY),
    GetSlot(relativeTo, ISO_HOUR),
    GetSlot(relativeTo, ISO_MINUTE),
    GetSlot(relativeTo, ISO_SECOND),
    GetSlot(relativeTo, ISO_MILLISECOND),
    GetSlot(relativeTo, ISO_MICROSECOND),
    GetSlot(relativeTo, ISO_NANOSECOND),
    GetSlot(relativeTo, CALENDAR)
  );
  return { relativeTo, days };
}

export function MoveRelativeZonedDateTime(relativeTo, years, months, weeks, days) {
  const timeZone = GetSlot(relativeTo, TIME_ZONE);
  const calendar = GetSlot(relativeTo, CALENDAR);
  const intermediateNs = AddZonedDateTime(
    GetSlot(relativeTo, INSTANT),
    timeZone,
    calendar,
    years,
    months,
    weeks,
    days,
    0,
    0,
    0,
    0,
    0,
    0
  );
  return CreateTemporalZonedDateTime(intermediateNs, timeZone, calendar);
}

export function AdjustRoundedDurationDays(
  years,
  months,
  weeks,
  days,
  hours,
  minutes,
  seconds,
  milliseconds,
  microseconds,
  nanoseconds,
  increment,
  unit,
  roundingMode,
  relativeTo
) {
  if (
    !IsTemporalZonedDateTime(relativeTo) ||
    unit === 'year' ||
    unit === 'month' ||
    unit === 'week' ||
    unit === 'day' ||
    (unit === 'nanosecond' && increment === 1)
  ) {
    return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
  }

  // There's one more round of rounding possible: if relativeTo is a
  // ZonedDateTime, the time units could have rounded up into enough hours
  // to exceed the day length. If this happens, grow the date part by a
  // single day and re-run exact time rounding on the smaller remainder. DO
  // NOT RECURSE, because once the extra hours are sucked up into the date
  // duration, there's no way for another full day to come from the next
  // round of rounding. And if it were possible (e.g. contrived calendar
  // with 30-minute-long "days") then it'd risk an infinite loop.
  let timeRemainderNs = TotalDurationNanoseconds(
    0,
    hours,
    minutes,
    seconds,
    milliseconds,
    microseconds,
    nanoseconds,
    0
  );
  const direction = MathSign(JSBI.toNumber(timeRemainderNs));

  const timeZone = GetSlot(relativeTo, TIME_ZONE);
  const calendar = GetSlot(relativeTo, CALENDAR);
  const dayStart = AddZonedDateTime(
    GetSlot(relativeTo, INSTANT),
    timeZone,
    calendar,
    years,
    months,
    weeks,
    days,
    0,
    0,
    0,
    0,
    0,
    0
  );
  const TemporalInstant = GetIntrinsic('%Temporal.Instant%');
  const dayEnd = AddZonedDateTime(
    new TemporalInstant(dayStart),
    timeZone,
    calendar,
    0,
    0,
    0,
    direction,
    0,
    0,
    0,
    0,
    0,
    0
  );
  const dayLengthNs = JSBI.subtract(dayEnd, dayStart);

  if (JSBI.greaterThanOrEqual(JSBI.multiply(JSBI.subtract(timeRemainderNs, dayLengthNs), JSBI.BigInt(direction)), ZERO)) {
    ({ years, months, weeks, days } = AddDuration(
      years,
      months,
      weeks,
      days,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      direction,
      0,
      0,
      0,
      0,
      0,
      0,
      relativeTo
    ));
    timeRemainderNs = RoundInstant(JSBI.subtract(timeRemainderNs, dayLengthNs), increment, unit, roundingMode);
    ({ hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = BalanceDuration(
      0,
      0,
      0,
      0,
      0,
      0,
      JSBI.toNumber(timeRemainderNs),
      'hour'
    ));
  }
  return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds };
}

export function RoundDuration(
  years: number,
  months: number,
  weeks: number,
  days: number,
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
  microseconds: number,
  nanosecondsParam: number, // Or something else?
  increment: number,
  unit,
  roundingMode,
  relativeTo = undefined
) {
  const TemporalDuration = GetIntrinsic('%Temporal.Duration%');
  let calendar, zdtRelative;
  if (relativeTo) {
    if (IsTemporalZonedDateTime(relativeTo)) {
      zdtRelative = relativeTo;
      relativeTo = BuiltinTimeZoneGetPlainDateTimeFor(
        GetSlot(relativeTo, TIME_ZONE),
        GetSlot(relativeTo, INSTANT),
        GetSlot(relativeTo, CALENDAR)
      );
    } else if (!IsTemporalDateTime(relativeTo)) {
      throw new TypeError('starting point must be PlainDateTime or ZonedDateTime');
    }
    calendar = GetSlot(relativeTo, CALENDAR);
  }

  // First convert time units up to days, if rounding to days or higher units.
  // If rounding relative to a ZonedDateTime, then some days may not be 24h.
  let dayLengthNs: JSBI;
  let nanoseconds = JSBI.BigInt(nanosecondsParam);
  if (unit === 'year' || unit === 'month' || unit === 'week' || unit === 'day') {
    nanoseconds = TotalDurationNanoseconds(0, hours, minutes, seconds, milliseconds, microseconds, nanosecondsParam, 0);
    let intermediate;
    if (zdtRelative) {
      intermediate = MoveRelativeZonedDateTime(zdtRelative, years, months, weeks, days);
    }
    let deltaDays;
    let dayLength: number;
    ({ days: deltaDays, nanoseconds, dayLengthNs: dayLength } = NanosecondsToDays(nanoseconds, intermediate));
    dayLengthNs = JSBI.BigInt(dayLength);
    days += deltaDays;
    hours = minutes = seconds = milliseconds = microseconds = 0;
  }

  let total: number;
  switch (unit) {
    case 'year': {
      if (!calendar) throw new RangeError('A starting point is required for years rounding');

      // convert months and weeks to days by calculating difference(
      // relativeTo + years, relativeTo + { years, months, weeks })
      const yearsDuration = new TemporalDuration(years);
      const dateAdd = calendar.dateAdd;
      const firstAddOptions = ObjectCreate(null);
      const yearsLater = CalendarDateAdd(calendar, relativeTo, yearsDuration, firstAddOptions, dateAdd);
      const yearsMonthsWeeks = new TemporalDuration(years, months, weeks);
      const secondAddOptions = ObjectCreate(null);
      const yearsMonthsWeeksLater = CalendarDateAdd(calendar, relativeTo, yearsMonthsWeeks, secondAddOptions, dateAdd);
      const monthsWeeksInDays = DaysUntil(yearsLater, yearsMonthsWeeksLater);
      relativeTo = yearsLater;
      days += monthsWeeksInDays;

      const thirdAddOptions = ObjectCreate(null);
      const daysLater = CalendarDateAdd(calendar, relativeTo, { days }, thirdAddOptions, dateAdd);
      const untilOptions = ObjectCreate(null);
      untilOptions.largestUnit = 'year';
      const yearsPassed = CalendarDateUntil(calendar, relativeTo, daysLater, untilOptions).years;
      years += yearsPassed;
      const oldRelativeTo = relativeTo;
      const fourthAddOptions = ObjectCreate(null);
      relativeTo = CalendarDateAdd(calendar, relativeTo, { years: yearsPassed }, fourthAddOptions, dateAdd);
      const daysPassed = DaysUntil(oldRelativeTo, relativeTo);
      days -= daysPassed;
      const oneYear = new TemporalDuration(days < 0 ? -1 : 1);
      let { days: oneYearDays } = MoveRelativeDate(calendar, relativeTo, oneYear);

      // Note that `nanoseconds` below (here and in similar code for months,
      // weeks, and days further below) isn't actually nanoseconds for the
      // full date range.  Instead, it's a BigInt representation of total
      // days multiplied by the number of nanoseconds in the last day of
      // the duration. This lets us do days-or-larger rounding using BigInt
      // math which reduces precision loss.
      const oneYearDayBI = abs(JSBI.BigInt(oneYearDays));
      const divisor = JSBI.multiply(oneYearDayBI, dayLengthNs);
      nanoseconds = JSBI.add(JSBI.add(JSBI.multiply(divisor, JSBI.BigInt(years)), JSBI.multiply(JSBI.BigInt(days), dayLengthNs)), nanoseconds);
      const rounded = RoundNumberToIncrement(nanoseconds, JSBI.toNumber(JSBI.multiply(divisor, JSBI.BigInt(increment))), roundingMode);
      total = JSBI.toNumber(JSBI.BigInt(nanoseconds)) / JSBI.toNumber(divisor);
      years = JSBI.toNumber(JSBI.divide(rounded, divisor));
      months = weeks = days = 0;
      nanoseconds = ZERO;
      break;
    }
    case 'month': {
      if (!calendar) throw new RangeError('A starting point is required for months rounding');

      // convert weeks to days by calculating difference(relativeTo +
      //   { years, months }, relativeTo + { years, months, weeks })
      const yearsMonths = new TemporalDuration(years, months);
      const dateAdd = calendar.dateAdd;
      const firstAddOptions = ObjectCreate(null);
      const yearsMonthsLater = CalendarDateAdd(calendar, relativeTo, yearsMonths, firstAddOptions, dateAdd);
      const yearsMonthsWeeks = new TemporalDuration(years, months, weeks);
      const secondAddOptions = ObjectCreate(null);
      const yearsMonthsWeeksLater = CalendarDateAdd(calendar, relativeTo, yearsMonthsWeeks, secondAddOptions, dateAdd);
      const weeksInDays = DaysUntil(yearsMonthsLater, yearsMonthsWeeksLater);
      relativeTo = yearsMonthsLater;
      days += weeksInDays;

      // Months may be different lengths of days depending on the calendar,
      // convert days to months in a loop as described above under 'years'.
      const sign = MathSign(days);
      const oneMonth = new TemporalDuration(0, days < 0 ? -1 : 1);
      let oneMonthDays: number;
      ({ relativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
      while (MathAbs(days) >= MathAbs(oneMonthDays)) {
        months += sign;
        days -= oneMonthDays;
        ({ relativeTo, days: oneMonthDays } = MoveRelativeDate(calendar, relativeTo, oneMonth));
      }
      oneMonthDays = MathAbs(oneMonthDays);
      const divisor = JSBI.multiply(JSBI.BigInt(oneMonthDays), dayLengthNs);
      nanoseconds = JSBI.add(JSBI.add(JSBI.multiply(divisor, JSBI.BigInt(months)), JSBI.multiply(JSBI.BigInt(days), dayLengthNs)), nanoseconds);
      const rounded = RoundNumberToIncrement(nanoseconds, JSBI.toNumber(JSBI.multiply(divisor, JSBI.BigInt(increment))), roundingMode);
      total = JSBI.toNumber(nanoseconds) / JSBI.toNumber(divisor);
      months = JSBI.toNumber(JSBI.divide(rounded, divisor));
      weeks = days = 0;
      nanoseconds = ZERO;
      break;
    }
    case 'week': {
      if (!calendar) throw new RangeError('A starting point is required for weeks rounding');
      // Weeks may be different lengths of days depending on the calendar,
      // convert days to weeks in a loop as described above under 'years'.
      const sign = MathSign(days);
      const oneWeek = new TemporalDuration(0, 0, days < 0 ? -1 : 1);
      let oneWeekDays;
      ({ relativeTo, days: oneWeekDays } = MoveRelativeDate(calendar, relativeTo, oneWeek));
      while (MathAbs(days) >= MathAbs(oneWeekDays)) {
        weeks += sign;
        days -= oneWeekDays;
        ({ relativeTo, days: oneWeekDays } = MoveRelativeDate(calendar, relativeTo, oneWeek));
      }
      oneWeekDays = MathAbs(oneWeekDays);
      const divisor = JSBI.multiply(JSBI.BigInt(oneWeekDays), dayLengthNs);
      nanoseconds = JSBI.add(JSBI.add(JSBI.multiply(divisor, JSBI.BigInt(weeks)), JSBI.multiply(JSBI.BigInt(days), dayLengthNs)), nanoseconds);
      const rounded = RoundNumberToIncrement(nanoseconds, JSBI.toNumber(JSBI.multiply(divisor, JSBI.BigInt(increment))), roundingMode);
      total = JSBI.toNumber(nanoseconds) / JSBI.toNumber(divisor);
      weeks = JSBI.toNumber(JSBI.divide(rounded, divisor));
      days = 0;
      nanoseconds = ZERO;
      break;
    }
    case 'day': {
      const divisor = dayLengthNs;
      nanoseconds = JSBI.add(JSBI.multiply(divisor, JSBI.BigInt(days)), nanoseconds);
      const rounded = RoundNumberToIncrement(nanoseconds, JSBI.toNumber(JSBI.multiply(divisor, JSBI.BigInt(increment))), roundingMode);
      total = JSBI.toNumber(nanoseconds) / JSBI.toNumber(divisor);
      days = JSBI.toNumber(JSBI.divide(rounded, divisor));
      nanoseconds = ZERO;
      break;
    }
    case 'hour': {
      const divisor = 3600e9;
      const hoursAsNanos = JSBI.multiply(JSBI.BigInt(hours), JSBI.BigInt(3600e9));
      const minutesAsNanos = JSBI.multiply(JSBI.BigInt(minutes), JSBI.BigInt(60e9));
      const secondsAsNanos = JSBI.multiply(JSBI.BigInt(seconds), JSBI.BigInt(1e9));
      const millisecondsAsNanos = JSBI.multiply(JSBI.BigInt(milliseconds), JSBI.BigInt(1e6));
      const microSecondsAsNanos = JSBI.multiply(JSBI.BigInt(microseconds), JSBI.BigInt(1e3));
      const allNanoseconds = JSBI.add(hoursAsNanos, JSBI.add(minutesAsNanos, JSBI.add(secondsAsNanos, JSBI.add(millisecondsAsNanos, JSBI.add(microSecondsAsNanos, nanoseconds)))));
      total = JSBI.toNumber(allNanoseconds) / divisor;
      const rounded = RoundNumberToIncrement(allNanoseconds, divisor * increment, roundingMode);
      hours = JSBI.toNumber(JSBI.divide(rounded, JSBI.BigInt(divisor)));
      minutes = seconds = milliseconds = microseconds = 0;
      nanoseconds = ZERO;
      break;
    }
    case 'minute': {
      const divisor = 60e9;
      const minutesAsNanos = JSBI.multiply(JSBI.BigInt(minutes), JSBI.BigInt(60e9));
      const secondsAsNanos = JSBI.multiply(JSBI.BigInt(seconds), JSBI.BigInt(1e9));
      const millisecondsAsNanos = JSBI.multiply(JSBI.BigInt(milliseconds), JSBI.BigInt(1e6));
      const microSecondsAsNanos = JSBI.multiply(JSBI.BigInt(microseconds), JSBI.BigInt(1e3));
      nanoseconds = JSBI.add(JSBI.add(JSBI.add(JSBI.add(minutesAsNanos, secondsAsNanos), millisecondsAsNanos), microSecondsAsNanos), nanoseconds);
      total = JSBI.toNumber(nanoseconds) / divisor;
      const rounded = RoundNumberToIncrement(nanoseconds, divisor * increment, roundingMode);
      minutes = JSBI.toNumber(JSBI.divide(rounded, JSBI.BigInt(divisor)));
      seconds = milliseconds = microseconds = 0;
      nanoseconds = ZERO;
      break;
    }
    case 'second': {
      const divisor = 1e9;
      const secondsAsNanos = JSBI.multiply(JSBI.BigInt(seconds), JSBI.BigInt(1e9));
      const millisecondsAsNanos = JSBI.multiply(JSBI.BigInt(milliseconds), JSBI.BigInt(1e6));
      const microSecondsAsNanos = JSBI.multiply(JSBI.BigInt(microseconds), JSBI.BigInt(1e3));
      nanoseconds = JSBI.add(JSBI.add(JSBI.add(secondsAsNanos, millisecondsAsNanos), microSecondsAsNanos), nanoseconds);
      total = JSBI.toNumber(nanoseconds) / divisor;
      const rounded = RoundNumberToIncrement(nanoseconds, divisor * increment, roundingMode);
      seconds = JSBI.toNumber(JSBI.divide(rounded, JSBI.BigInt(divisor)));
      milliseconds = microseconds = 0;
      nanoseconds = ZERO;
      break;
    }
    case 'millisecond': {
      const divisor = 1e6;
      const millisecondsAsNanos = JSBI.multiply(JSBI.BigInt(milliseconds), JSBI.BigInt(1e6));
      const microSecondsAsNanos = JSBI.multiply(JSBI.BigInt(microseconds), JSBI.BigInt(1e3));
      nanoseconds = JSBI.add(JSBI.add(millisecondsAsNanos, microSecondsAsNanos), nanoseconds);
      total = JSBI.toNumber(nanoseconds) / divisor;
      const rounded = RoundNumberToIncrement(nanoseconds, divisor * increment, roundingMode);
      milliseconds = JSBI.toNumber(JSBI.divide(rounded, JSBI.BigInt(divisor)));
      microseconds = 0;
      nanoseconds = ZERO;
      break;
    }
    case 'microsecond': {
      const divisor = 1e3;
      const microSecondsAsNanos = JSBI.multiply(JSBI.BigInt(microseconds), JSBI.BigInt(1e3));
      nanoseconds = JSBI.add(microSecondsAsNanos, nanoseconds);
      total = JSBI.toNumber(nanoseconds) / divisor;
      const rounded = RoundNumberToIncrement(nanoseconds, divisor * increment, roundingMode);
      microseconds = JSBI.toNumber(JSBI.divide(rounded, JSBI.BigInt(divisor)));
      0;
      nanoseconds = ZERO;
      break;
    }
    case 'nanosecond': {
      total = JSBI.toNumber(nanoseconds);
      nanoseconds = RoundNumberToIncrement(nanoseconds, increment, roundingMode);
      break;
    }
  }
  return { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds: JSBI.toNumber(nanoseconds), total };
}

export function CompareISODate(y1, m1, d1, y2, m2, d2) {
  for (const [x, y] of [
    [y1, y2],
    [m1, m2],
    [d1, d2]
  ]) {
    if (x !== y) return ComparisonResult(x - y);
  }
  return 0;
}

function NonNegativeModulo(x, y) {
  let result = x % y;
  if (ObjectIs(result, -0)) return 0;
  if (result < 0) result += y;
  return result;
}

// Could eventually be 'bigint' ?
export type ExternalBigInt = bigint;

export function ToBigIntExternal(arg: unknown): ExternalBigInt {
  if (typeof globalThis.BigInt !== 'undefined') return globalThis.BigInt(arg);
  const jsbiBI = ToBigInt(arg);
  return jsbiBI as unknown as ExternalBigInt;
}

export function ToBigInt(arg: unknown): JSBI {
  if (arg instanceof JSBI) {
    return arg;
  }

  let prim = arg;
  if (typeof arg === 'object') {
    const toPrimFn = arg[Symbol.toPrimitive];
    if (toPrimFn && typeof toPrimFn === 'function') {
      prim = ReflectApply(toPrimFn, arg, ['number']);
    }
  }
  switch (typeof prim) {
    case 'undefined':
    case 'object':
    case 'number':
    case 'symbol':
    default:
      throw new TypeError(`cannot convert ${typeof arg} to bigint`);
    case 'string':
      if (!prim.match(/^\s*(?:[+-]?\d+\s*)?$/)) {
        throw new SyntaxError('invalid BigInt syntax');
      }
    // eslint: no-fallthrough: false
    case 'bigint':
      try {
        return JSBI.BigInt((prim as bigint).toString());
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Invalid integer')) throw new SyntaxError(e.message);
        throw e;
      }
    case 'boolean':
      if (prim) {
        return JSBI.BigInt(1);
      } else {
        return ZERO;
      }
  }
}

// Note: This method returns values with bogus nanoseconds based on the previous iteration's
// milliseconds. That way there is a guarantee that the full nanoseconds are always going to be
// increasing at least and that the microsecond and nanosecond fields are likely to be non-zero.
export const SystemUTCEpochNanoSeconds: () => JSBI = (() => {
  let ns = JSBI.BigInt(Date.now() % 1e6);
  return () => {
    const ms = JSBI.BigInt(Date.now());
    const result = JSBI.add(JSBI.multiply(ms, JSBI.BigInt(1e6)), ns);
    ns = JSBI.divide(ms, JSBI.BigInt(1e6));
    if (JSBI.greaterThan(result, NS_MAX)) return NS_MAX;
    if (JSBI.lessThan(result, NS_MIN)) return NS_MIN;
    return result;
  };
})();

export function SystemTimeZone() {
  const fmt = new IntlDateTimeFormat('en-us');
  const TemporalTimeZone = GetIntrinsic('%Temporal.TimeZone%');
  return new TemporalTimeZone(TemporalTimeZoneFromString(fmt.resolvedOptions().timeZone));
}

export function ComparisonResult(value) {
  return value < 0 ? -1 : value > 0 ? 1 : value;
}
export function GetOptionsObject(options): {[key: string]: unknown} {
  if (options === undefined) return ObjectCreate(null);
  if (IsObject(options)) return options;
  throw new TypeError(`Options parameter must be an object, not ${options === null ? 'null' : `a ${typeof options}`}`);
}

function GetOption<T extends readonly string[]>(options: unknown, property: unknown, allowedValues: T): (T[number])
function GetOption<T extends readonly string[], F extends string>(options: unknown, property: unknown, allowedValues: T, fallback: F): (T[number]) | F
function GetOption(options: unknown, property: unknown, allowedValues: readonly string[], fallback?: string): (typeof allowedValues[number]) | typeof fallback {
  const value = (options as any)[(property as any)];
  if (value !== undefined) {
    const valueStr = ToString(value);
    if (!allowedValues.includes(valueStr)) {
      throw new RangeError(`${property} must be one of ${allowedValues.join(', ')}, not ${valueStr}`);
    }
    return valueStr;
  }
  return fallback;
}

function GetNumberOption(options, property, minimum, maximum, fallback) {
  let value = options[property];
  if (value === undefined) return fallback;
  value = ToNumber(value);
  if (NumberIsNaN(value) || value < minimum || value > maximum) {
    throw new RangeError(`${property} must be between ${minimum} and ${maximum}, not ${value}`);
  }
  return MathFloor(value);
}

const OFFSET = new RegExp(`^${PARSE.offset.source}$`);

function bisect(getState, left, right, lstate = getState(left), rstate = getState(right)) {
  left = JSBI.BigInt(left);
  right = JSBI.BigInt(right);
  while (JSBI.greaterThan(JSBI.subtract(right, left), JSBI.BigInt(1))) {
    const middle = JSBI.divide(JSBI.add(left, right), JSBI.BigInt(2));
    const mstate = getState(middle);
    if (mstate === lstate) {
      left = middle;
      lstate = mstate;
    } else if (mstate === rstate) {
      right = middle;
      rstate = mstate;
    } else {
      throw new Error(`invalid state in bisection ${lstate} - ${mstate} - ${rstate}`);
    }
  }
  return right;
}

const nsPerTimeUnit = {
  hour: 3600e9,
  minute: 60e9,
  second: 1e9,
  millisecond: 1e6,
  microsecond: 1e3,
  nanosecond: 1
};
