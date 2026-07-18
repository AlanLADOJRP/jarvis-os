"use client";

import { useMemo, useState } from "react";
import { Brain, Send, Sparkles } from "lucide-react";
import type { AssistantAction } from "@/types/chat";
import type { CalorieEntryRecord, NutritionItem } from "@/types/nutrition";

const CUSTOM_FOODS_KEY = "jarvis-custom-foods-v1";

function intentStatusMessage(input: string): string | null {
  const lower = input.toLowerCase();

  if (/(water|oz|hydration)/.test(lower)) {
    return "Water command handling is not implemented yet. Open Water once it is operational.";
  }

  if (/(task|todo|remind|reminder)/.test(lower)) {
    return "Task command handling is not implemented yet. Open Tasks once it is operational.";
  }

  if (/(gym|workout|lift|cardio)/.test(lower)) {
    return "Global Gym intent parsing is not implemented yet. Use the Gym module actions for now.";
  }

  return null;
}

export function GlobalCommand() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("JARVIS command ready.");

  const suggestions = useMemo(
    () => ["I ate 2 eggs and toast", "How many calories left today?", "What did I eat yesterday?"],
    [],
  );

  async function resolveAction(action: AssistantAction) {
    if (action.intent === "log_food") {
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: action.entries }),
      });
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to log food.");
      }

      setStatus(`Logged ${action.entries.length} item${action.entries.length === 1 ? "" : "s"}. ${action.reply}`);
      return;
    }

    if (action.intent === "query_today") {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const response = await fetch(`/api/entries?date=${today}`);
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to query today.");
      }

      const entries = payload.entries ?? [];
      if (entries.length === 0) {
        setStatus("No nutrition entries logged today.");
        return;
      }

      const calories = entries.reduce((sum, entry) => sum + entry.calories, 0);
      setStatus(`Today: ${calories} calories across ${entries.length} item${entries.length === 1 ? "" : "s"}.`);
      return;
    }

    if (action.intent === "query_history") {
      const response = await fetch(`/api/entries?date=${action.date ?? ""}`);
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to query history.");
      }
      const entries = payload.entries ?? [];
      if (entries.length === 0) {
        setStatus(`No entries found for ${action.date ?? "that date"}.`);
        return;
      }
      const calories = entries.reduce((sum, entry) => sum + entry.calories, 0);
      setStatus(`${action.date ?? "That day"}: ${calories} calories across ${entries.length} entries.`);
      return;
    }

    if (action.intent === "delete_entry" || action.intent === "update_entry" || action.intent === "undo_last") {
      setStatus("This command requires confirmation workflow in Nutrition. Open Nutrition to complete it.");
      return;
    }

    setStatus(action.clarificationQuestion ?? action.reply);
  }

  async function submit(rawInput?: string) {
    const outgoing = (rawInput ?? input).trim();
    if (!outgoing || loading) return;

    const unsupported = intentStatusMessage(outgoing);
    if (unsupported) {
      setStatus(unsupported);
      setInput("");
      return;
    }

    setLoading(true);
    setStatus("Thinking...");

    try {
      let customFoods: NutritionItem[] = [];
      const storedFoods = localStorage.getItem(CUSTOM_FOODS_KEY);
      if (storedFoods) {
        try {
          customFoods = JSON.parse(storedFoods) as NutritionItem[];
        } catch {
          customFoods = [];
        }
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outgoing,
          recentMessages: [],
          customFoods,
        }),
      });

      const payload = (await response.json()) as { action?: AssistantAction; error?: string };
      if (!response.ok || !payload.action) {
        throw new Error(payload.error ?? "Could not process command.");
      }

      await resolveAction(payload.action);
      setInput("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Command failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-6 sm:w-[420px]">
      <div className="pointer-events-auto rounded-2xl border border-cyan-400/30 bg-slate-950/90 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left"
        >
          <span className="inline-flex items-center gap-2 text-sm text-slate-100">
            <Brain size={16} className="text-cyan-200" />
            Global JARVIS Command
          </span>
          <span className="text-xs text-slate-400">{isOpen ? "Hide" : "Open"}</span>
        </button>

        {isOpen ? (
          <div className="mt-3 space-y-3">
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">{status}</p>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => submit(item)}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-cyan-400"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Type a command for JARVIS"
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => submit()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500 text-black disabled:opacity-60"
                aria-label="Send global command"
              >
                {loading ? <Sparkles size={16} className="animate-pulse" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
