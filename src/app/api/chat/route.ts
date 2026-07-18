import { GymStatus, TaskPriority, WorkoutType } from "@prisma/client";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assistantActionSchema, assistantResponseSchema, inferMealByChicagoTime } from "@/types/chat";
import type { AssistantAction } from "@/types/chat";
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

function isAcknowledgement(message: string): boolean {
  return /^(ok|okay|kk|got it|sounds good|perfect|nice|cool|thanks|thank you|thx)[.!]?$/i.test(message.trim());
}

function acknowledgementMessage(recentMessages: Array<{ role: "user" | "assistant"; content: string }>): string {
  const lastAssistant = [...recentMessages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const lower = lastAssistant.toLowerCase();

  if (lower.includes("to-do") || lower.includes("task")) {
    return "Done. It's already on your to-do list.";
  }

  if (lower.includes("water")) {
    return "Done. I already logged that water entry.";
  }

  if (lower.includes("gym")) {
    return "Done. I already updated your gym entry.";
  }

  if (lower.includes("meal") || lower.includes("calorie") || lower.includes("food")) {
    return "Done. I already logged that nutrition entry.";
  }

  return "Done.";
}

function fallbackAction(message: string, catalog: NutritionItem[]): AssistantAction {
  const lower = message.toLowerCase();

  const waterMatch = lower.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/);
  const cupsMatch = lower.match(/(\d+(?:\.\d+)?)\s*(cup|cups)\b/);
  const bottleMatch = lower.match(/(\d+(?:\.\d+)?)\s*(bottle|bottles)\b/);
  const waterIntent = /(drank|drink|water|hydration)/.test(lower);
  if (waterIntent) {
    const ounces = waterMatch
      ? Math.round(Number(waterMatch[1]))
      : cupsMatch
        ? Math.round(Number(cupsMatch[1]) * 8)
        : bottleMatch
          ? Math.round(Number(bottleMatch[1]) * 16)
          : 8;

    return {
      intent: "log_water",
      reply: `I can log ${ounces} oz of water.`,
      ounces,
      confidence: 0.93,
      needsConfirmation: false,
    };
  }

  if (/(went to the gym|worked out|gym today|did cardio|lifted)/.test(lower)) {
    return {
      intent: "log_gym",
      reply: "I can log a completed gym session for today.",
      status: GymStatus.COMPLETED,
      workoutType: /(cardio|run|bike)/.test(lower) ? WorkoutType.CARDIO : WorkoutType.OTHER,
      confidence: 0.92,
      needsConfirmation: false,
    };
  }

  if (/(missed the gym|skipped the gym|didn t go to the gym|didn't go to the gym)/.test(lower)) {
    return {
      intent: "log_gym",
      reply: "I can mark today as a missed gym day.",
      status: GymStatus.MISSED,
      workoutType: null,
      confidence: 0.91,
      needsConfirmation: false,
    };
  }

  if (/(what are my tasks|show my tasks|list my tasks|todo list|to do list)/.test(lower)) {
    return {
      intent: "query_tasks",
      reply: "I can pull your current to-do list.",
      confidence: 0.92,
      needsConfirmation: false,
    };
  }

  if (/(remind me to|remember to|need to remember to|i need to remember to|add task|todo|to do)/.test(lower)) {
    const title = message
      .replace(/^(i\s+need\s+to\s+remember\s+to|need\s+to\s+remember\s+to|remember\s+to|remind\s+me\s+to|add\s+task|todo|to\s+do)\s*/i, "")
      .trim();

    return {
      intent: "create_task",
      reply: `I can add "${title || "New task"}" to your to-do list.`,
      title: title || "New task",
      priority: TaskPriority.MEDIUM,
      confidence: title ? 0.91 : 0.72,
      needsConfirmation: !title,
      clarificationQuestion: title ? undefined : "What should the task say?",
    };
  }

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

function buildAssistantMessage(action: z.infer<typeof assistantActionSchema>): string {
  switch (action.intent) {
    case "log_food":
      return action.needsConfirmation && action.clarificationQuestion
        ? `I think I understood most of that. ${action.clarificationQuestion}`
        : "Got it. I can log that meal for you.";
    case "log_water":
      return `Got it. I can log ${action.ounces} oz of water.`;
    case "log_gym":
      return action.status === GymStatus.MISSED
        ? "Understood. I can mark today as a missed gym day."
        : "Got it. I can log a gym entry for today.";
    case "create_task":
      return `Got it. I can add \"${action.title}\" to your to-do list.`;
    case "query_tasks":
      return "Sure. I can pull up your current tasks.";
    case "query_today":
      return "Sure. Here is your current status for today.";
    case "query_history":
      return "Sure. I can look that up.";
    case "delete_entry":
      return "I can help remove that nutrition entry once you confirm it.";
    case "update_entry":
      return "I can help update that entry once you confirm the change.";
    case "undo_last":
      return "I can undo your most recent nutrition entry once you confirm it.";
    case "unknown":
      return action.clarificationQuestion ?? action.reply;
  }
}

function normalizeAction(action: z.infer<typeof assistantActionSchema>): z.infer<typeof assistantActionSchema> {
  if (action.confidence < 0.8 && action.intent !== "query_today" && action.intent !== "query_tasks") {
    return {
      ...action,
      needsConfirmation: true,
      clarificationQuestion:
        "clarificationQuestion" in action
          ? (action.clarificationQuestion ?? "Could you clarify that request?")
          : "Could you clarify that request?",
    };
  }

  return action;
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

    if (isAcknowledgement(parsed.data.message)) {
      return NextResponse.json({
        message: acknowledgementMessage(parsed.data.recentMessages),
        actions: [],
      });
    }

    const mergedCatalog = mergeCatalogs(parsed.data.customFoods);
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const systemPrompt = [
      "You are JARVIS OS, a conversational assistant that can also trigger structured actions.",
      "Return only a JSON object with this shape: { message: string, actions: AssistantAction[] }.",
      "The message should sound natural, concise, and conversational, like a capable assistant replying to the user.",
      "Use actions only when the user is asking you to log, update, create, or fetch something actionable.",
      "If the user is unclear, return a natural clarification message and an empty actions array.",
      "Never invent nutrition values when an item exists in provided catalog.",
      "Use catalog values exactly and compute quantities like double/triple/2x/half.",
      "Prefer one summarized entry for restaurant bowls.",
      "Support gym logging, water logging, and task creation when the user clearly asks for them.",
      "For water, convert 1 cup to 8 ounces and 1 bottle to 16 ounces unless the user provides ounces.",
      "For gym, use COMPLETED when the user says they went or worked out, and MISSED when they say they skipped or missed.",
      "For tasks, return concise task titles without extra filler.",
      "Treat reminder phrasing like 'remember to', 'need to remember to', or 'I need to remember to' as task creation.",
      "If confidence < 0.8, set needsConfirmation=true and include clarificationQuestion.",
      "Do not claim an entry was saved in the message; describe what you can do or what you understood.",
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
          "log_water",
          "log_gym",
          "create_task",
          "query_tasks",
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

    let responseRaw: unknown;

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
      responseRaw = JSON.parse(content);
    } catch {
      const fallback = fallbackAction(parsed.data.message, mergedCatalog);
      const normalizedFallback = normalizeAction(fallback);
      responseRaw = {
        message: buildAssistantMessage(normalizedFallback),
        actions: normalizedFallback.intent === "unknown" ? [] : [normalizedFallback],
      };
    }

    const responseParsed = assistantResponseSchema.safeParse(responseRaw);

    let assistantMessage = "I need a little more detail to help with that.";
    let actions: z.infer<typeof assistantActionSchema>[] = [];

    if (responseParsed.success) {
      assistantMessage = responseParsed.data.message;
      actions = responseParsed.data.actions.map(normalizeAction);
    } else {
      const actionParsed = assistantActionSchema.safeParse(responseRaw);
      if (!actionParsed.success) {
        const fallback = normalizeAction(fallbackAction(parsed.data.message, mergedCatalog));
        assistantMessage = buildAssistantMessage(fallback);
        actions = fallback.intent === "unknown" ? [] : [fallback];
      } else {
        const action = normalizeAction(actionParsed.data);
        assistantMessage = buildAssistantMessage(action);
        actions = action.intent === "unknown" ? [] : [action];
      }
    }

    return NextResponse.json({
      message: assistantMessage,
      actions,
      action: actions[0] ?? fallbackAction(parsed.data.message, mergedCatalog),
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to process chat request.",
      },
      { status: 500 },
    );
  }
}
