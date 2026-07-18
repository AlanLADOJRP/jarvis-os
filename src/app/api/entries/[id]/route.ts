import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteEntry, updateEntry } from "@/server/entries";
import { mealSchema } from "@/types/chat";

const sourceSchema = z.enum([
  "Built-in catalog",
  "Uploaded menu",
  "User-provided estimate",
  "AI estimate",
]);

const updateSchema = z.object({
  food: z.string().min(1).optional(),
  calories: z.number().nonnegative().optional(),
  meal: mealSchema.optional(),
  protein: z.number().nullable().optional(),
  carbs: z.number().nullable().optional(),
  fat: z.number().nullable().optional(),
  fiber: z.number().nullable().optional(),
  quantity: z.number().positive().optional(),
  servingSize: z.string().nullable().optional(),
  restaurant: z.string().nullable().optional(),
  source: sourceSchema.optional(),
  loggedAt: z.string().datetime().optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update body.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "At least one field is required for update." },
        { status: 400 },
      );
    }

    const entry = await updateEntry(id, parsed.data);
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update entry." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await deleteEntry(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete entry." },
      { status: 500 },
    );
  }
}
