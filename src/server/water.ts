import "server-only";
import { getPrisma } from "@/lib/prisma";
import { chicagoRangeToUtc } from "@/lib/time";
import { ensureDefaultUser } from "@/server/db-user";

export type WaterEntryRecord = {
  id: string;
  ounces: number;
  loggedAt: string;
  createdAt: string;
};

function mapEntry(entry: { id: string; ounces: number; loggedAt: Date; createdAt: Date }): WaterEntryRecord {
  return {
    id: entry.id,
    ounces: entry.ounces,
    loggedAt: entry.loggedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function listWaterEntriesForDate(date: string): Promise<WaterEntryRecord[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const { startUtc, endUtc } = chicagoRangeToUtc(date);
  const rows = await prisma.waterEntry.findMany({
    where: {
      userId: user.id,
      loggedAt: {
        gte: new Date(startUtc),
        lte: new Date(endUtc),
      },
    },
    orderBy: { loggedAt: "desc" },
  });

  return rows.map(mapEntry);
}

export async function createWaterEntry(input: { ounces: number; loggedAt?: string }): Promise<WaterEntryRecord> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const row = await prisma.waterEntry.create({
    data: {
      userId: user.id,
      ounces: input.ounces,
      loggedAt: input.loggedAt ? new Date(input.loggedAt) : new Date(),
    },
  });
  return mapEntry(row);
}

export async function getWaterTotalForDate(date: string): Promise<number> {
  const rows = await listWaterEntriesForDate(date);
  return rows.reduce((sum, row) => sum + row.ounces, 0);
}
