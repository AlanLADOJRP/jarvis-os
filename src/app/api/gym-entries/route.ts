import { NextResponse } from "next/server";
import { z } from "zod";
import { GymStatus, WorkoutType } from "@prisma/client";
import { createGymEntry, getGymEntriesForMonth, listGymEntries } from "@/server/gym";

const createSchema = z.object({
  date: z.string().datetime(),
  status: z.nativeEnum(GymStatus),
  workoutType: z.nativeEnum(WorkoutType).nullable().optional(),
  startTime: z.string().datetime().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  cardioMinutes: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const entries = await getGymEntriesForMonth(month);
      return NextResponse.json({ entries });
    }

    const entries = await listGymEntries();
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to fetch gym entries." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid gym entry body.", details: parsed.error.flatten() }, { status: 400 });
    }

    const entry = await createGymEntry(parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create gym entry." }, { status: 500 });
  }
}
