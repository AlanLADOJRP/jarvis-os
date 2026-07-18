import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assistantActionSchema, inferMealByChicagoTime } from "@/types/chat";
import type { NutritionItem } from "@/types/nutrition";
import { mergeCatalogs, parseIngredientTotals, findFoodMatch } from "@/lib/nutrition";
import { getServerEnv } from "@/lib/env";

const requestSchema = z.object({
  message: z.string().min(1),
  recentMessages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1),
    }),
  ),
  customFoods: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
      restaurant: z.string().optional(),
      servingSize: z.string(),
      calories: z.number(),
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
      fiber: z.number().optional(),
    }),
  ),
});

function fallbackAction(message: string, catalog: NutritionItem[]) {
  const lower = message.toLowerCase();

  if (lower.includes("undo")) {
    return {
      intent: "undo_last",
      reply: "I can undo your most recent entry. Please confirm.",
      confidence: 0.95,
      needsConfirmation: true,
    };
  }

  if (lower.includes("how many") || lower.includes("left") || lower.includes("today")) {
    return {
      intent: "query_today",
      reply: "I can check your totals for today.",
      confidence: 0.92,
      needsConfirmation: false,
    };
  }

  if (lower.includes("yesterday") || lower.includes("history")) {
    return {
      intent: "query_history",
      reply: "I can pull your food history.",
      confidence: 0.88,
      needsConfirmation: false,
    };
  }

  if (lower.includes("remove") || lower.includes("delete")) {
    return {
      intent: "delete_entry",
      reply: "I found a delete request. Please confirm after I match the entry.",
      searchText: message,
      confidence: 0.82,
      needsConfirmation: true,
    };
  }

  if (lower.includes("change") || lower.includes("make that")) {
    return {
      intent: "update_entry",
      reply: "I can update your latest matching entry. Please confirm once I match it.",
      searchText: message,
      confidence: 0.81,
      needsConfirmation: true,
    };
  }

  const matched = findFoodMatch(message, catalog);
  const bowlStyle = message.toLowerCase().includes("bowl") || message.toLowerCase().includes("with");
  if (matched || bowlStyle) {
    if (bowlStyle) {
      const totals = parseIngredientTotals(message, catalog);
      if (totals.lines.length > 0) {
        const lineText = totals.lines
          .map((line) => `${line.quantity > 1 ? `${line.quantity}x ` : ""}${line.name} (${line.calories} cal)`)
          .join(", ");

        return {
          intent: "log_food",
          reply: `I parsed your meal from the catalog: ${lineText}.`,
          entries: [
            {
              food: "Custom bowl",
              calories: totals.totalCalories,
              meal: inferMealByChicagoTime(),
            },
          ],
          confidence: totals.unresolved.length > 0 ? 0.75 : 0.93,
          needsConfirmation: totals.unresolved.length > 0,
          clarificationQuestion:
            totals.unresolved.length > 0
              ? `I could not match: ${totals.unresolved.join(", ")}. Confirm logging what I matched?`
              : undefined,
        };
      }
    }

    if (matched) {
      return {
        intent: "log_food",
        reply: `I matched ${matched.item.name} from your nutrition catalog.`,
        entries: [
          {
            food: matched.item.name,
            calories: matched.item.calories,
            meal: inferMealByChicagoTime(),
          },
        ],
        confidence: 0.9,
        needsConfirmation: false,
      };
    }
  }

  return {
    intent: "unknown",
    reply: "I could not confidently interpret that. Could you clarify the food and quantity?",
    confidence: 0.45,
    needsConfirmation: true,
    clarificationQuestion: "Can you rephrase with the food name and quantity?",
  };
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid chat request.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const mergedCatalog = mergeCatalogs(parsed.data.customFoods);
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const systemPrompt = [
      "You are a calorie tracking intent parser for JARVIS Calories.",
      "Return only a JSON object matching the required schema.",
      "Never invent nutrition values when an item exists in provided catalog.",
      "Use catalog values exactly and compute quantities like double/triple/2x/half.",
      "Prefer one summarized entry for restaurant bowls.",
      "If confidence < 0.8, set needsConfirmation=true and include clarificationQuestion.",
      "Do not claim an entry was saved; only propose actions.",
      "Meal windows in America/Chicago: Breakfast 4:00-10:59, Lunch 11:00-15:59, Dinner 16:00-21:59, Snack 22:00-3:59.",
      "Support references to recent context, like 'make that three' or 'remove that'.",
    ].join("\n");

    const userPrompt = JSON.stringify(
      {
        message: parsed.data.message,
        recentMessages: parsed.data.recentMessages.slice(-12),
        timezone: "America/Chicago",
        catalog: mergedCatalog,
        requiredIntents: [
          "log_food",
          "delete_entry",
          "update_entry",
          "query_today",
          "query_history",
          "undo_last",
          "unknown",
        ],
      },
      null,
      2,
    );

    let actionRaw: unknown;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("No content");
      actionRaw = JSON.parse(content);
    } catch {
      actionRaw = fallbackAction(parsed.data.message, mergedCatalog);
    }

    const actionParsed = assistantActionSchema.safeParse(actionRaw);
    if (!actionParsed.success) {
      const fallback = fallbackAction(parsed.data.message, mergedCatalog);
      return NextResponse.json({ action: fallback });
    }

    const action = actionParsed.data;
    if (action.confidence < 0.8 && action.intent !== "query_today") {
      return NextResponse.json({
        action: {
          ...action,
          needsConfirmation: true,
          clarificationQuestion:
            "clarificationQuestion" in action
              ? (action.clarificationQuestion ?? "Could you clarify that request?")
              : "Could you clarify that request?",
        },
      });
    }

    return NextResponse.json({ action });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to process chat request.",
      },
      { status: 500 },
    );
  }
}
