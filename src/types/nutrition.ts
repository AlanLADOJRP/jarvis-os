export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export type EntrySourceType =
  | "Built-in catalog"
  | "Uploaded menu"
  | "User-provided estimate"
  | "AI estimate";

export type NutritionItem = {
  id: string;
  name: string;
  aliases: string[];
  restaurant?: string;
  servingSize: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
};

export type CalorieEntryCreateInput = {
  food: string;
  calories: number;
  meal: MealType;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  quantity?: number;
  servingSize?: string | null;
  restaurant?: string | null;
  source?: EntrySourceType;
  loggedAt?: string;
};

export type CalorieEntryRecord = CalorieEntryCreateInput & {
  id: string;
  loggedAt: string;
  createdAt: string;
  updatedAt: string;
  created_date: string;
  updated_date: string;
  created_by_id?: string | null;
};
