import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AssistantAction } from "@/types/chat";
import { mergeCatalogs } from "@/lib/nutrition";
import { getServerEnv } from "@/lib/env";
import { routeJarvisRequest } from "@/server/jarvis-router";

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

const unknownFallbackAction: AssistantAction = {
  intent: "unknown",
  reply: "I need a little more detail to help with that.",
  confidence: 0.4,
  needsConfirmation: true,
  clarificationQuestion: "Can you rephrase that with a bit more detail?",
};

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

    const response = await routeJarvisRequest({
      message: parsed.data.message,
      recentMessages: parsed.data.recentMessages,
      catalog: mergedCatalog,
      openai,
    });

    return NextResponse.json({
      intent: response.intent,
      message: response.message,
      actions: response.actions,
      action: response.actions[0] ?? unknownFallbackAction,
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
