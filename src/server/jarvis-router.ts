import "server-only";

import { GymStatus, TaskPriority, WorkoutType } from "@prisma/client";
import OpenAI from "openai";
import {
  assistantIntentClassificationSchema,
  type AssistantAction,
  type AssistantIntent,
  type AssistantResponse,
  type ChatMessage,
  inferMealByChicagoTime,
} from "@/types/chat";
import type { NutritionItem } from "@/types/nutrition";
import { findFoodMatch, parseIngredientTotals } from "@/lib/nutrition";

type RouterContext = {
  message: string;
  recentMessages: ChatMessage[];
  catalog: NutritionItem[];
  openai: OpenAI;
};

type IntentHandler = (context: RouterContext) => Promise<AssistantResponse>;

function isAcknowledgement(message: string): boolean {
  return /^(ok|okay|kk|got it|sounds good|perfect|nice|cool|thanks|thank you|thx|yes|yep)[.!]?$/i.test(message.trim());
}

function isGreeting(message: string): boolean {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)[!.?]*$/i.test(message.trim());
}

function acknowledgementMessage(recentMessages: ChatMessage[]): string {
  const lastAssistant = [...recentMessages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const lower = lastAssistant.toLowerCase();

  if (lower.includes("to-do") || lower.includes("task")) return "Done. It's already on your to-do list.";
  if (lower.includes("water")) return "Done. I already logged that water entry.";
  if (lower.includes("gym")) return "Done. I already updated your gym entry.";
  if (lower.includes("meal") || lower.includes("calorie") || lower.includes("food")) {
    return "Done. I already logged that nutrition entry.";
  }

  return "Done.";
}

function buildAssistantMessage(action: AssistantAction): string {
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
    case "complete_task":
      return `Got it. I can mark \"${action.searchText}\" as complete.`;
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

function normalizeAction(action: AssistantAction): AssistantAction {
  if (
    action.confidence < 0.8 &&
    action.intent !== "query_today" &&
    action.intent !== "query_tasks"
  ) {
    return {
      ...action,
      needsConfirmation: true,
      clarificationQuestion:
        "clarificationQuestion" in action
          ? (action.clarificationQuestion ?? "Could you clarify that request?")
          : "Could you clarify that request?",
    } as AssistantAction;
  }

  return action;
}

function extractTaskTitle(message: string): string {
  return message
    .replace(/^(i\s+need\s+to\s+remember\s+to|need\s+to\s+remember\s+to|remember\s+to|remind\s+me\s+to|add\s+task|todo|to\s+do)\s*/i, "")
    .trim();
}

function classifyIntentHeuristically(message: string, catalog: NutritionItem[]): AssistantIntent | null {
  const lower = message.toLowerCase().trim();

  if (isAcknowledgement(message) || isGreeting(message)) return "conversation";
  if (/^i need to remember something[.!?]*$/i.test(message.trim())) return "memory";
  if (/(remember to|remind me to|need to remember to|i need to remember to|add task|todo|to do)/.test(lower)) {
    return extractTaskTitle(message) ? "task_create" : "memory";
  }
  if (/(i finished|i completed|mark .* done|check off|done with)/.test(lower)) return "task_complete";
  if (/(what are my tasks|show my tasks|list my tasks|todo list|to do list)/.test(lower)) return "general_question";
  if (/(went to the gym|worked out|gym today|did cardio|lifted|missed the gym|skipped the gym|didn't go to the gym|didn t go to the gym)/.test(lower)) return "gym_log";
  if (/(gym status|did i go to the gym|what gym|workout today)/.test(lower)) return "gym_question";
  if (/(drank|drink|water|hydration|cup|cups|bottle|bottles|oz|ounce|ounces)/.test(lower)) {
    if (/(how much water|water today|hydration today)/.test(lower)) return "water_question";
    return "water_log";
  }
  if (/(how many calories|calories left|what did i eat|food today|nutrition today|yesterday|history)/.test(lower)) return "nutrition_question";

  const matched = findFoodMatch(message, catalog);
  const bowlStyle = lower.includes("bowl") || lower.includes("with");
  if (matched || bowlStyle || /(i ate|i had|ate |had )/.test(lower)) return "nutrition_log";
  if (/(steps|walked|ran|activity|miles)/.test(lower)) return "activity_log";
  if (/(calendar|schedule|appointment|meeting)/.test(lower)) return "calendar";
  if (/(progress|streak|trend)/.test(lower)) return "progress";
  if (/(settings|theme|goal|preferences)/.test(lower)) return "settings";
  if (/^(what|why|how|when|where|who|can you|could you|would you|do you)/.test(lower)) return "general_question";
  return null;
}

async function classifyIntentWithModel(context: RouterContext): Promise<AssistantIntent> {
  const heuristic = classifyIntentHeuristically(context.message, context.catalog);
  if (heuristic) return heuristic;

  const systemPrompt = [
    "You are an intent classifier for JARVIS OS.",
    "Return only JSON with { intent, confidence }.",
    "Classify the user message into exactly one allowed intent.",
    "Use nutrition_log only when the user is explicitly logging food or drink calories/meals.",
    "Use nutrition_question for calorie, food history, or nutrition status questions.",
    "Use conversation for greetings, thanks, confirmations, and small talk.",
    "Use memory when the user says they need to remember something but has not provided the concrete thing yet.",
    "Use task_create when the user gives a concrete reminder or to-do to store.",
    "Use water_log for hydration logging.",
    "Use gym_log for workout logging.",
    "Never use nutrition_log for greetings, confirmations, task requests, gym, water, or general questions.",
  ].join("\n");

  const completion = await context.openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          message: context.message,
          recentMessages: context.recentMessages.slice(-8),
          allowedIntents: assistantIntentClassificationSchema.shape.intent.options,
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return "unknown";

  const parsed = assistantIntentClassificationSchema.safeParse(JSON.parse(content));
  return parsed.success ? parsed.data.intent : "unknown";
}

function buildResponse(intent: AssistantIntent, message: string, actions: AssistantAction[] = []): AssistantResponse {
  return { intent, message, actions };
}

function parseNutritionLogAction(message: string, catalog: NutritionItem[]): AssistantAction {
  const matched = findFoodMatch(message, catalog);
  const bowlStyle = message.toLowerCase().includes("bowl") || message.toLowerCase().includes("with");

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

  return {
    intent: "unknown",
    reply: "I couldn't confidently identify the food to log.",
    confidence: 0.45,
    needsConfirmation: true,
    clarificationQuestion: "Can you rephrase with the food name and quantity?",
  };
}

function parseNutritionQuestionAction(message: string): AssistantAction {
  const lower = message.toLowerCase();

  if (lower.includes("yesterday") || lower.includes("history")) {
    return {
      intent: "query_history",
      reply: "I can pull your food history.",
      confidence: 0.9,
      needsConfirmation: false,
    };
  }

  return {
    intent: "query_today",
    reply: "I can check your nutrition totals for today.",
    confidence: 0.95,
    needsConfirmation: false,
  };
}

function parseWaterLogAction(message: string): AssistantAction {
  const lower = message.toLowerCase();
  const waterMatch = lower.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/);
  const cupsMatch = lower.match(/(\d+(?:\.\d+)?)\s*(cup|cups)\b/);
  const bottleMatch = lower.match(/(\d+(?:\.\d+)?)\s*(bottle|bottles)\b/);

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

function parseGymLogAction(message: string): AssistantAction {
  const lower = message.toLowerCase();
  if (/(missed the gym|skipped the gym|didn't go to the gym|didn t go to the gym)/.test(lower)) {
    return {
      intent: "log_gym",
      reply: "I can mark today as a missed gym day.",
      status: GymStatus.MISSED,
      workoutType: null,
      confidence: 0.91,
      needsConfirmation: false,
    };
  }

  return {
    intent: "log_gym",
    reply: "I can log a completed gym session for today.",
    status: GymStatus.COMPLETED,
    workoutType: /(cardio|run|bike)/.test(lower) ? WorkoutType.CARDIO : WorkoutType.OTHER,
    confidence: 0.92,
    needsConfirmation: false,
  };
}

const handlers: Record<AssistantIntent, IntentHandler> = {
  conversation: async (context) => {
    if (isAcknowledgement(context.message)) {
      return buildResponse("conversation", acknowledgementMessage(context.recentMessages));
    }
    if (isGreeting(context.message)) {
      return buildResponse("conversation", "Hey. What can I help you with today?");
    }
    return buildResponse("conversation", "I'm here. What do you want to take care of?");
  },
  nutrition_log: async (context) => {
    const action = normalizeAction(parseNutritionLogAction(context.message, context.catalog));
    return buildResponse("nutrition_log", buildAssistantMessage(action), action.intent === "unknown" ? [] : [action]);
  },
  nutrition_question: async (context) => {
    const action = normalizeAction(parseNutritionQuestionAction(context.message));
    return buildResponse("nutrition_question", buildAssistantMessage(action), [action]);
  },
  gym_log: async (context) => {
    const action = normalizeAction(parseGymLogAction(context.message));
    return buildResponse("gym_log", buildAssistantMessage(action), [action]);
  },
  gym_question: async () => buildResponse("gym_question", "I can help with gym status and workout questions. Ask me about today's gym status or your recent workouts."),
  water_log: async (context) => {
    const action = normalizeAction(parseWaterLogAction(context.message));
    return buildResponse("water_log", buildAssistantMessage(action), [action]);
  },
  water_question: async () => buildResponse("water_question", "I can help with hydration questions. Ask me how much water you've had today."),
  activity_log: async () => buildResponse("activity_log", "Activity logging is not implemented yet, but the router is ready for it."),
  task_create: async (context) => {
    const title = extractTaskTitle(context.message);
    if (!title) {
      return buildResponse("task_create", "What do you want me to remember?", []);
    }

    const action = normalizeAction({
      intent: "create_task",
      reply: `I can add \"${title}\" to your to-do list.`,
      title,
      priority: TaskPriority.MEDIUM,
      confidence: 0.92,
      needsConfirmation: false,
    });
    return buildResponse("task_create", buildAssistantMessage(action), [action]);
  },
  task_complete: async (context) => {
    const searchText = context.message
      .replace(/^(i\s+finished|i\s+completed|mark|check\s+off|done\s+with)\s*/i, "")
      .replace(/\s+done$/i, "")
      .trim();

    if (!searchText) {
      return buildResponse("task_complete", "Which task should I mark as complete?", []);
    }

    const action = normalizeAction({
      intent: "complete_task",
      reply: `I can mark \"${searchText}\" as complete.`,
      searchText,
      confidence: 0.9,
      needsConfirmation: false,
    });
    return buildResponse("task_complete", buildAssistantMessage(action), [action]);
  },
  reminder: async (context) => {
    const title = extractTaskTitle(context.message);
    return title
      ? handlers.task_create(context)
      : buildResponse("reminder", "What would you like me to remember?", []);
  },
  calendar: async () => buildResponse("calendar", "Calendar workflows are not implemented yet, but I can route them here once that module is added."),
  progress: async () => buildResponse("progress", "I can help with progress summaries once the Progress module is fully implemented."),
  settings: async () => buildResponse("settings", "Settings changes are not implemented through chat yet. Use the Settings module for now."),
  memory: async () => buildResponse("memory", "Sure. What do you want me to remember?", []),
  general_question: async (context) => {
    if (/(what are my tasks|show my tasks|list my tasks|todo list|to do list)/i.test(context.message)) {
      const action = normalizeAction({
        intent: "query_tasks",
        reply: "I can pull up your current tasks.",
        confidence: 0.95,
        needsConfirmation: false,
      });
      return buildResponse("general_question", buildAssistantMessage(action), [action]);
    }

    return buildResponse(
      "general_question",
      "I can help with nutrition, gym, water, to-dos, and reminders. Ask me naturally and I'll route it to the right module.",
    );
  },
  unknown: async () => buildResponse("unknown", "I’m not fully sure what you want yet. Can you rephrase that in a little more detail?", []),
};

export async function routeJarvisRequest(context: RouterContext): Promise<AssistantResponse> {
  const intent = await classifyIntentWithModel(context);
  const handler = handlers[intent] ?? handlers.unknown;
  const response = await handler(context);
  return { ...response, intent };
}
