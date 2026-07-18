import { NextResponse } from "next/server";
import { z } from "zod";
import { GymStatus, WorkoutType } from "@prisma/client";
import { deleteGymEntry, updateGymEntry } from "@/server/gym";

const updateSchema = z.object({
  date: z.string().datetime().optional(),
  status: z.nativeEnum(GymStatus).optional(),
  workoutType: z.nativeEnum(WorkoutType).nullable().optional(),
  startTime: z.string().datetime().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  cardioMinutes: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid gym update body.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const entry = await updateGymEntry(id, parsed.data);
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update gym entry." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await deleteGymEntry(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete gym entry." },
      { status: 500 },
    );
  }
}
