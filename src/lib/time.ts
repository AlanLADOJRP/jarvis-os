import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const USER_TIMEZONE = "America/Chicago";

export function chicagoDateString(date = new Date()): string {
  return formatInTimeZone(date, USER_TIMEZONE, "yyyy-MM-dd");
}

export function chicagoRangeToUtc(date: string): { startUtc: string; endUtc: string } {
  const startUtc = fromZonedTime(`${date}T00:00:00.000`, USER_TIMEZONE).toISOString();
  const endUtc = fromZonedTime(`${date}T23:59:59.999`, USER_TIMEZONE).toISOString();
  return { startUtc, endUtc };
}
