import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkCreateEntries, clearDay, getEntriesForDate, getEntriesForMonth } from "@/server/entries";
import { chicagoDateString } from "@/lib/time";
import { mealSchema } from "@/types/chat";

const sourceSchema = z.enum([
  "Built-in catalog",
  "Uploaded menu",
  "User-provided estimate",
  "AI estimate",
]);

const createEntriesSchema = z.object({
  entries: z
    .array(
      z.object({
        food: z.string().min(1),
        calories: z.number().nonnegative(),
        meal: mealSchema,
        protein: z.number().nullable().optional(),
        carbs: z.number().nullable().optional(),
        fat: z.number().nullable().optional(),
        fiber: z.number().nullable().optional(),
        quantity: z.number().positive().optional(),
        servingSize: z.string().nullable().optional(),
        restaurant: z.string().nullable().optional(),
        source: sourceSchema.optional(),
        loggedAt: z.string().datetime().optional(),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const monthParam = url.searchParams.get("month");

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const entries = await getEntriesForMonth(monthParam);
      return NextResponse.json({ entries });
    }

    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : chicagoDateString();

    const entries = await getEntriesForDate(date);
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch entries." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createEntriesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const created = await bulkCreateEntries(parsed.data.entries);
    return NextResponse.json({ entries: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create entries." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : chicagoDateString();

    const deletedCount = await clearDay(date);
    return NextResponse.json({ success: true, deletedCount, date });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to clear entries." },
      { status: 500 },
    );
  }
}
