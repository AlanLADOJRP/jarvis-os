import "server-only";
import { type GymEntry, type GymSchedule, type GymStatus, type WorkoutType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { ensureDefaultUser } from "@/server/db-user";

type GymEntryInput = {
  date: string;
  status: GymStatus;
  workoutType?: WorkoutType | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  cardioMinutes?: number | null;
  energyLevel?: string | null;
  difficultyLevel?: string | null;
  notes?: string | null;
};

export async function listGymEntries(limit = 100): Promise<GymEntry[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  return prisma.gymEntry.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: limit,
  });
}

export async function getGymEntriesForMonth(month: string): Promise<GymEntry[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));

  return prisma.gymEntry.findMany({
    where: {
      userId: user.id,
      date: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { date: "asc" },
  });
}

export async function createGymEntry(input: GymEntryInput): Promise<GymEntry> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  return prisma.gymEntry.create({
    data: {
      userId: user.id,
      date: new Date(input.date),
      status: input.status,
      workoutType: input.workoutType ?? null,
      startTime: input.startTime ? new Date(input.startTime) : null,
      endTime: input.endTime ? new Date(input.endTime) : null,
      durationMinutes: input.durationMinutes ?? null,
      cardioMinutes: input.cardioMinutes ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateGymEntry(id: string, input: Partial<GymEntryInput>): Promise<GymEntry> {
  const prisma = getPrisma();
  return prisma.gymEntry.update({
    where: { id },
    data: {
      ...(input.date ? { date: new Date(input.date) } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.workoutType !== undefined ? { workoutType: input.workoutType } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime ? new Date(input.startTime) : null } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime ? new Date(input.endTime) : null } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.cardioMinutes !== undefined ? { cardioMinutes: input.cardioMinutes } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

export async function deleteGymEntry(id: string) {
  const prisma = getPrisma();
  await prisma.gymEntry.delete({ where: { id } });
  return { success: true };
}

export async function listGymSchedule(): Promise<GymSchedule[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  return prisma.gymSchedule.findMany({ where: { userId: user.id }, orderBy: { dayOfWeek: "asc" } });
}
