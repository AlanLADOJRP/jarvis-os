import type { CalorieEntryRecord } from "@/types/nutrition";
import type { WorkoutType } from "@prisma/client";

export type GymEntryView = {
  id: string;
  date: string;
  status: "PLANNED" | "COMPLETED" | "SKIPPED" | "MISSED";
  workoutType?: WorkoutType | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  cardioMinutes?: number | null;
  notes?: string | null;
  createdAt?: string;
};

export type DashboardDataPayload = {
  todayKey: string;
  currentMonthKey: string;
  previousMonthKey: string;
  entriesToday: CalorieEntryRecord[];
  entriesCurrentMonth: CalorieEntryRecord[];
  entriesPreviousMonth: CalorieEntryRecord[];
  gymCurrentMonth: GymEntryView[];
  gymPreviousMonth: GymEntryView[];
};
