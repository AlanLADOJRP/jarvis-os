import "server-only";
import {
  Meal,
  NutritionSource,
  type NutritionEntry,
  type Prisma,
} from "@prisma/client";
import { chicagoDateString, chicagoRangeToUtc } from "@/lib/time";
import { getPrisma } from "@/lib/prisma";
import { ensureDefaultUser } from "@/server/db-user";
import type { CalorieEntryCreateInput, CalorieEntryRecord } from "@/types/nutrition";

function toPrismaMeal(meal: CalorieEntryCreateInput["meal"]): Meal {
  switch (meal) {
    case "Breakfast":
      return Meal.BREAKFAST;
    case "Lunch":
      return Meal.LUNCH;
    case "Dinner":
      return Meal.DINNER;
    case "Snack":
      return Meal.SNACK;
  }
}

function fromPrismaMeal(meal: Meal): CalorieEntryCreateInput["meal"] {
  switch (meal) {
    case Meal.BREAKFAST:
      return "Breakfast";
    case Meal.LUNCH:
      return "Lunch";
    case Meal.DINNER:
      return "Dinner";
    case Meal.SNACK:
      return "Snack";
  }
}

function toPrismaSource(source?: CalorieEntryCreateInput["source"]): NutritionSource {
  switch (source) {
    case "Uploaded menu":
      return NutritionSource.CUSTOM_MENU;
    case "User-provided estimate":
      return NutritionSource.USER_ESTIMATE;
    case "AI estimate":
      return NutritionSource.AI_ESTIMATE;
    case "Built-in catalog":
    default:
      return NutritionSource.BUILT_IN_CATALOG;
  }
}

function fromPrismaSource(source: NutritionSource): NonNullable<CalorieEntryCreateInput["source"]> {
  switch (source) {
    case NutritionSource.CUSTOM_MENU:
      return "Uploaded menu";
    case NutritionSource.USER_ESTIMATE:
      return "User-provided estimate";
    case NutritionSource.AI_ESTIMATE:
      return "AI estimate";
    case NutritionSource.BUILT_IN_CATALOG:
    default:
      return "Built-in catalog";
  }
}

function mapEntry(entry: NutritionEntry): CalorieEntryRecord {
  const loggedAt = entry.loggedAt.toISOString();
  const updatedAt = entry.updatedAt.toISOString();

  return {
    id: entry.id,
    food: entry.food,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fiber: entry.fiber,
    quantity: entry.quantity,
    servingSize: entry.servingSize,
    restaurant: entry.restaurant,
    source: fromPrismaSource(entry.source),
    meal: fromPrismaMeal(entry.meal),
    loggedAt,
    createdAt: entry.createdAt.toISOString(),
    updatedAt,
    created_date: loggedAt,
    updated_date: updatedAt,
    created_by_id: entry.userId,
  };
}

async function buildCreateData(
  input: CalorieEntryCreateInput,
): Promise<Prisma.NutritionEntryUncheckedCreateInput> {
  const user = await ensureDefaultUser();

  return {
    userId: user.id,
    food: input.food,
    calories: Math.round(input.calories),
    protein: input.protein ?? null,
    carbs: input.carbs ?? null,
    fat: input.fat ?? null,
    fiber: input.fiber ?? null,
    quantity: input.quantity ?? 1,
    servingSize: input.servingSize ?? null,
    restaurant: input.restaurant ?? null,
    source: toPrismaSource(input.source),
    meal: toPrismaMeal(input.meal),
    loggedAt: input.loggedAt ? new Date(input.loggedAt) : new Date(),
  };
}

export async function listEntries(limit = 200): Promise<CalorieEntryRecord[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const rows = await prisma.nutritionEntry.findMany({
    where: { userId: user.id },
    orderBy: { loggedAt: "desc" },
    take: limit,
  });

  return rows.map(mapEntry);
}

export async function createEntry(input: CalorieEntryCreateInput): Promise<CalorieEntryRecord> {
  const prisma = getPrisma();
  const row = await prisma.nutritionEntry.create({
    data: await buildCreateData(input),
  });

  return mapEntry(row);
}

export async function bulkCreateEntries(
  entries: CalorieEntryCreateInput[],
): Promise<CalorieEntryRecord[]> {
  if (entries.length === 0) return [];

  const prisma = getPrisma();
  const data = await Promise.all(entries.map((entry) => buildCreateData(entry)));
  const created = await prisma.$transaction(
    data.map((entryData) =>
      prisma.nutritionEntry.create({
        data: entryData,
      }),
    ),
  );

  return created.map(mapEntry);
}

export async function updateEntry(
  id: string,
  input: Partial<CalorieEntryCreateInput>,
): Promise<CalorieEntryRecord> {
  const prisma = getPrisma();

  const data: Prisma.NutritionEntryUpdateInput = {};
  if (input.food !== undefined) data.food = input.food;
  if (input.calories !== undefined) data.calories = Math.round(input.calories);
  if (input.meal !== undefined) data.meal = toPrismaMeal(input.meal);
  if (input.protein !== undefined) data.protein = input.protein;
  if (input.carbs !== undefined) data.carbs = input.carbs;
  if (input.fat !== undefined) data.fat = input.fat;
  if (input.fiber !== undefined) data.fiber = input.fiber;
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.servingSize !== undefined) data.servingSize = input.servingSize;
  if (input.restaurant !== undefined) data.restaurant = input.restaurant;
  if (input.source !== undefined) data.source = toPrismaSource(input.source);
  if (input.loggedAt !== undefined) data.loggedAt = new Date(input.loggedAt);

  const row = await prisma.nutritionEntry.update({
    where: { id },
    data,
  });

  return mapEntry(row);
}

export async function deleteEntry(id: string): Promise<{ success: boolean }> {
  const prisma = getPrisma();
  await prisma.nutritionEntry.delete({ where: { id } });
  return { success: true };
}

export async function getTodayEntries(): Promise<CalorieEntryRecord[]> {
  const date = chicagoDateString();
  return getEntriesForDate(date);
}

export async function getEntriesForDate(date: string): Promise<CalorieEntryRecord[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const { startUtc, endUtc } = chicagoRangeToUtc(date);

  const rows = await prisma.nutritionEntry.findMany({
    where: {
      userId: user.id,
      loggedAt: {
        gte: new Date(startUtc),
        lte: new Date(endUtc),
      },
    },
    orderBy: { loggedAt: "desc" },
    take: 500,
  });

  return rows.map(mapEntry);
}

export async function getMostRecentEntry(): Promise<CalorieEntryRecord | null> {
  const rows = await listEntries(1);
  return rows[0] ?? null;
}

export async function searchRecentEntriesByFoodName(
  searchText: string,
  limit = 30,
): Promise<CalorieEntryRecord[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const query = searchText.trim();
  if (!query) return [];

  const rows = await prisma.nutritionEntry.findMany({
    where: {
      userId: user.id,
      food: {
        contains: query,
        mode: "insensitive",
      },
    },
    orderBy: { loggedAt: "desc" },
    take: limit,
  });

  return rows.map(mapEntry);
}

export async function clearDay(date: string): Promise<number> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const { startUtc, endUtc } = chicagoRangeToUtc(date);
  const result = await prisma.nutritionEntry.deleteMany({
    where: {
      userId: user.id,
      loggedAt: {
        gte: new Date(startUtc),
        lte: new Date(endUtc),
      },
    },
  });

  return result.count;
}
