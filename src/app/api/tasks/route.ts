import { NextResponse } from "next/server";
import { TaskPriority } from "@prisma/client";
import { z } from "zod";
import { createTask, listTasks } from "@/server/tasks";

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export async function GET() {
  try {
    const tasks = await listTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch tasks." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid task request body.", details: parsed.error.flatten() }, { status: 400 });
    }

    const task = await createTask(parsed.data);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create task." },
      { status: 500 },
    );
  }
}
