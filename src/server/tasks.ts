import "server-only";
import { TaskPriority, TaskStatus, type Task } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { ensureDefaultUser } from "@/server/db-user";
import type { CreateTaskInput, TaskRecord } from "@/types/tasks";

function mapTask(task: Task): TaskRecord {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function listTasks(limit = 50): Promise<TaskRecord[]> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const rows = await prisma.task.findMany({
    where: { userId: user.id },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(mapTask);
}

export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  const prisma = getPrisma();
  const user = await ensureDefaultUser();
  const row = await prisma.task.create({
    data: {
      userId: user.id,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? TaskPriority.MEDIUM,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    },
  });
  return mapTask(row);
}

export async function updateTask(id: string, input: Partial<CreateTaskInput> & { status?: TaskStatus }): Promise<TaskRecord> {
  const prisma = getPrisma();
  const row = await prisma.task.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      ...(input.status !== undefined
        ? {
            status: input.status,
            completedAt: input.status === TaskStatus.DONE ? new Date() : null,
          }
        : {}),
    },
  });
  return mapTask(row);
}

export async function deleteTask(id: string): Promise<{ success: boolean }> {
  const prisma = getPrisma();
  await prisma.task.delete({ where: { id } });
  return { success: true };
}
