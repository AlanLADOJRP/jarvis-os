import { z } from "zod";
import { GymStatus, TaskPriority, WorkoutType } from "@prisma/client";
import type { MealType } from "@/types/nutrition";

export const mealSchema = z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]);

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const logFoodSchema = z.object({
  intent: z.literal("log_food"),
  reply: z.string(),
  entries: z
    .array(
      z.object({
        food: z.string().min(1),
        calories: z.number().nonnegative(),
        meal: mealSchema,
      }),
    )
    .min(1),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const deleteEntrySchema = z.object({
  intent: z.literal("delete_entry"),
  reply: z.string(),
  searchText: z.string().optional(),
  entryId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const updateEntrySchema = z.object({
  intent: z.literal("update_entry"),
  reply: z.string(),
  searchText: z.string().optional(),
  quantity: z.number().positive().optional(),
  calories: z.number().nonnegative().optional(),
  food: z.string().optional(),
  meal: mealSchema.optional(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const queryTodaySchema = z.object({
  intent: z.literal("query_today"),
  reply: z.string(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.literal(false),
});

const queryHistorySchema = z.object({
  intent: z.literal("query_history"),
  reply: z.string(),
  date: z.string().optional(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const logWaterSchema = z.object({
  intent: z.literal("log_water"),
  reply: z.string(),
  ounces: z.number().int().positive(),
  loggedAt: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const logGymSchema = z.object({
  intent: z.literal("log_gym"),
  reply: z.string(),
  status: z.nativeEnum(GymStatus),
  workoutType: z.nativeEnum(WorkoutType).nullable().optional(),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  cardioMinutes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
  date: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const createTaskSchema = z.object({
  intent: z.literal("create_task"),
  reply: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const queryTasksSchema = z.object({
  intent: z.literal("query_tasks"),
  reply: z.string(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const undoLastSchema = z.object({
  intent: z.literal("undo_last"),
  reply: z.string(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

const unknownSchema = z.object({
  intent: z.literal("unknown"),
  reply: z.string(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().optional(),
});

export const assistantActionSchema = z.discriminatedUnion("intent", [
  logFoodSchema,
  deleteEntrySchema,
  updateEntrySchema,
  queryTodaySchema,
  queryHistorySchema,
  logWaterSchema,
  logGymSchema,
  createTaskSchema,
  queryTasksSchema,
  undoLastSchema,
  unknownSchema,
]);

export const assistantResponseSchema = z.object({
  message: z.string().min(1),
  actions: z.array(assistantActionSchema).default([]),
});

export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export function inferMealByChicagoTime(now = new Date()): MealType {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    hour: "2-digit",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "12");

  if (hour >= 4 && hour <= 10) return "Breakfast";
  if (hour >= 11 && hour <= 15) return "Lunch";
  if (hour >= 16 && hour <= 21) return "Dinner";
  return "Snack";
}
