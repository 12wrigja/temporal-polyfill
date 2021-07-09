import { ES } from './ecmascript';
import { GetIntrinsic } from './intrinsicclass';

const instant = () => {
  const Instant = GetIntrinsic('%Temporal.Instant%');
  return new Instant(ES.SystemUTCEpochNanoSeconds());
};
const plainDateTime = (calendarLike, temporalTimeZoneLike = defaultTimeZone()) => {
  const timeZone = ES.ToTemporalTimeZone(temporalTimeZoneLike);
  const calendar = ES.ToTemporalCalendar(calendarLike);
  const inst = instant();
  return ES.BuiltinTimeZoneGetPlainDateTimeFor(timeZone, inst, calendar);
};
const plainDateTimeISO = (temporalTimeZoneLike = defaultTimeZone()) => {
  const timeZone = ES.ToTemporalTimeZone(temporalTimeZoneLike);
  const calendar = ES.GetISO8601Calendar();
  const inst = instant();
  return ES.BuiltinTimeZoneGetPlainDateTimeFor(timeZone, inst, calendar);
};
const zonedDateTime = (calendarLike, temporalTimeZoneLike = defaultTimeZone()) => {
  const timeZone = ES.ToTemporalTimeZone(temporalTimeZoneLike);
  const calendar = ES.ToTemporalCalendar(calendarLike);
  return ES.CreateTemporalZonedDateTime(ES.SystemUTCEpochNanoSeconds(), timeZone, calendar);
};
const zonedDateTimeISO = (temporalTimeZoneLike = defaultTimeZone()) => {
  return zonedDateTime(ES.GetISO8601Calendar(), temporalTimeZoneLike);
};
const plainDate = (calendarLike, temporalTimeZoneLike = defaultTimeZone()) => {
  return ES.TemporalDateTimeToDate(plainDateTime(calendarLike, temporalTimeZoneLike));
};
const plainDateISO = (temporalTimeZoneLike = defaultTimeZone()) => {
  return ES.TemporalDateTimeToDate(plainDateTimeISO(temporalTimeZoneLike));
};
const plainTimeISO = (temporalTimeZoneLike = defaultTimeZone()) => {
  return ES.TemporalDateTimeToTime(plainDateTimeISO(temporalTimeZoneLike));
};
const defaultTimeZone = () => {
  return ES.SystemTimeZone();
};

export const now = {
  instant,
  plainDateTime,
  plainDateTimeISO,
  plainDate,
  plainDateISO,
  plainTimeISO,
  timeZone: defaultTimeZone,
  zonedDateTime,
  zonedDateTimeISO
};
