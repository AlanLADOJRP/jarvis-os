import { NextResponse } from "next/server";
import { z } from "zod";
import { chicagoDateString } from "@/lib/time";
import { createWaterEntry, listWaterEntriesForDate } from "@/server/water";

const createWaterSchema = z.object({
  ounces: z.number().int().positive(),
  loggedAt: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? chicagoDateString();
    const entries = await listWaterEntriesForDate(date);
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch water entries." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createWaterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid water request body.", details: parsed.error.flatten() }, { status: 400 });
    }

    const entry = await createWaterEntry(parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create water entry." },
      { status: 500 },
    );
  }
}
