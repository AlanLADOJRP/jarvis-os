import { nutritionCatalog } from "@/data/nutrition-catalog";
import type { NutritionItem } from "@/types/nutrition";

const quantityWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  double: 2,
  triple: 3,
  half: 0.5,
};

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quantityFromText(text: string): number {
  const normalized = normalizeName(text);

  const xMatch = normalized.match(/\b(\d+(?:\.\d+)?)x\b/);
  if (xMatch) return Number(xMatch[1]);

  const digitMatch = normalized.match(/\b(\d+(?:\.\d+)?)\b/);
  if (digitMatch) return Number(digitMatch[1]);

  for (const [word, count] of Object.entries(quantityWords)) {
    if (normalized.includes(word)) {
      return count;
    }
  }

  return 1;
}

export function mergeCatalogs(customFoods: NutritionItem[] = []): NutritionItem[] {
  const seen = new Set<string>();
  const merged = [...customFoods, ...nutritionCatalog].filter((item) => {
    const key = normalizeName(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return merged;
}

export function findFoodMatch(
  text: string,
  catalog: NutritionItem[],
): { item: NutritionItem; source: "built_in" | "custom" } | null {
  const normalizedText = normalizeName(text);

  for (const item of catalog) {
    const aliases = [item.name, ...item.aliases].map(normalizeName);
    const matched = aliases.some((alias) => normalizedText.includes(alias));
    if (matched) {
      const source = nutritionCatalog.some((nativeItem) => nativeItem.id === item.id)
        ? "built_in"
        : "custom";
      return { item, source };
    }
  }

  return null;
}

export function parseIngredientTotals(
  text: string,
  catalog: NutritionItem[],
): {
  totalCalories: number;
  lines: Array<{ name: string; calories: number; quantity: number }>;
  unresolved: string[];
} {
  const normalized = normalizeName(text);
  const segmentCandidates = normalized
    .split(/\bwith\b|\band\b|,/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const lines: Array<{ name: string; calories: number; quantity: number }> = [];
  const unresolved: string[] = [];

  for (const segment of segmentCandidates) {
    const match = findFoodMatch(segment, catalog);
    if (!match) {
      unresolved.push(segment);
      continue;
    }

    const quantity = quantityFromText(segment);
    lines.push({
      name: match.item.name,
      quantity,
      calories: Math.round(match.item.calories * quantity),
    });
  }

  const totalCalories = lines.reduce((sum, line) => sum + line.calories, 0);
  return { totalCalories, lines, unresolved };
}
