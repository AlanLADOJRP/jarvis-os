import { NextResponse } from "next/server";
import { chicagoDateString } from "@/lib/time";
import { getEntriesForDate, getEntriesForMonth } from "@/server/entries";
import { getGymEntriesForMonth } from "@/server/gym";

function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return monthKey;

  const date = new Date(Date.UTC(year, month - 2, 1));
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export async function GET() {
  try {
    const todayKey = chicagoDateString();
    const currentMonthKey = todayKey.slice(0, 7);
    const previousMonth = previousMonthKey(currentMonthKey);

    const [
      entriesToday,
      entriesCurrentMonth,
      entriesPreviousMonth,
      gymCurrentMonth,
      gymPreviousMonth,
    ] = await Promise.all([
      getEntriesForDate(todayKey),
      getEntriesForMonth(currentMonthKey),
      getEntriesForMonth(previousMonth),
      getGymEntriesForMonth(currentMonthKey),
      getGymEntriesForMonth(previousMonth),
    ]);

    return NextResponse.json({
      todayKey,
      currentMonthKey,
      previousMonthKey: previousMonth,
      entriesToday,
      entriesCurrentMonth,
      entriesPreviousMonth,
      gymCurrentMonth,
      gymPreviousMonth,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load dashboard data." },
      { status: 500 },
    );
  }
}
