"use client";

import { useMemo, useRef, useState } from "react";
import { Brain, Send, Sparkles } from "lucide-react";
import type { AssistantAction, AssistantResponse, ChatMessage } from "@/types/chat";
import type { CalorieEntryRecord, NutritionItem } from "@/types/nutrition";
import { mergeCatalogs, parseIngredientTotals } from "@/lib/nutrition";
import { useDashboardData } from "@/lib/dashboard-client";

const CHAT_STORAGE_KEY = "jarvis-global-chat-history-v1";
const CUSTOM_FOODS_KEY = "jarvis-custom-foods-v1";

type JarvisCommandPanelProps = {
  collapsible?: boolean;
  className?: string;
};

export function JarvisCommandPanel({ collapsible = false, className = "" }: JarvisCommandPanelProps) {
  const { data, refresh } = useDashboardData();
  const [isOpen, setIsOpen] = useState(!collapsible);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored) as ChatMessage[];
    } catch {
      return [];
    }
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => [
      "I ate 2 eggs and toast",
      "I went to the gym today",
      "I drank a cup of water",
      "I need to remember to pick up groceries",
    ],
    [],
  );

  function persistMessages(next: ChatMessage[]) {
    setMessages(next);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next));
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function runAction(action: AssistantAction, userMessage: string, assistantMessage: string): Promise<string> {
    if (action.intent === "unknown") {
      return action.clarificationQuestion ?? assistantMessage;
    }

    if (action.needsConfirmation && action.clarificationQuestion) {
      return `${assistantMessage}\n\n${action.clarificationQuestion}`;
    }

    if (action.intent === "log_food") {
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: action.entries }),
      });
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to log food.");

      const storedFoods = localStorage.getItem(CUSTOM_FOODS_KEY);
      const customFoods = storedFoods ? (JSON.parse(storedFoods) as NutritionItem[]) : [];
      const parsed = parseIngredientTotals(userMessage, mergeCatalogs(customFoods));
      const breakdown =
        parsed.lines.length > 0
          ? `\n\n${parsed.lines.map((line) => `${line.quantity > 1 ? `${line.quantity}x ` : ""}${line.name} - ${line.calories} cal`).join("\n")}`
          : "";
      await refresh(true);
      return `${assistantMessage}${breakdown}`;
    }

    if (action.intent === "log_water") {
      const response = await fetch("/api/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ounces: action.ounces, loggedAt: action.loggedAt }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to log water.");
      await refresh(true);
      return assistantMessage;
    }

    if (action.intent === "log_gym") {
      const todayKey = data?.todayKey ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const current = (data?.gymCurrentMonth ?? []).find((entry) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(entry.date)) === todayKey,
      );
      const body = {
        date: action.date ?? `${todayKey}T12:00:00.000Z`,
        status: action.status,
        workoutType: action.workoutType ?? null,
        durationMinutes: action.durationMinutes ?? null,
        cardioMinutes: action.cardioMinutes ?? null,
        notes: action.notes ?? null,
      };

      const response = await fetch(current ? `/api/gym-entries/${current.id}` : "/api/gym-entries", {
        method: current ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to log gym activity.");
      await refresh(true);
      return assistantMessage;
    }

    if (action.intent === "create_task") {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: action.title,
          description: action.description ?? null,
          priority: action.priority,
          dueAt: action.dueAt ?? null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create task.");
      await refresh(true);
      return assistantMessage;
    }

    if (action.intent === "complete_task") {
      const openTasks = (data?.tasks ?? []).filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
      const match = openTasks.find((task) =>
        task.title.toLowerCase().includes(action.searchText.toLowerCase()),
      ) ?? openTasks[0];

      if (!match) {
        return "I couldn't find an open task to mark complete.";
      }

      const response = await fetch(`/api/tasks/${match.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to complete task.");
      await refresh(true);
      return `Done. I marked \"${match.title}\" as complete.`;
    }

    if (action.intent === "query_tasks") {
      const tasks = (data?.tasks ?? []).filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
      return tasks.length === 0
        ? "You don't have any open tasks right now."
        : `You currently have ${tasks.length} open task${tasks.length === 1 ? "" : "s"}:\n${tasks
            .slice(0, 6)
            .map((task) => `- ${task.title}`)
            .join("\n")}`;
    }

    if (action.intent === "query_today") {
      const calories = (data?.entriesToday ?? []).reduce((sum, entry) => sum + entry.calories, 0);
      const water = data?.waterTodayOunces ?? 0;
      const gym = (data?.gymCurrentMonth ?? []).find((entry) => entry.date.slice(0, 10) === (data?.todayKey ?? ""));
      return `Today so far: ${calories} calories, ${water} oz of water, and gym is ${gym ? gym.status.toLowerCase() : "not logged yet"}.`;
    }

    if (action.intent === "clear_day") {
      const fallbackToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const targetDate = action.date ?? (data?.todayKey ?? fallbackToday);
      const response = await fetch(`/api/entries?date=${encodeURIComponent(targetDate)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { success?: boolean; deletedCount?: number; date?: string; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Unable to clear today's nutrition entries.");
      }
      await refresh(true);
      return `Done. Cleared ${payload.deletedCount ?? 0} nutrition entr${(payload.deletedCount ?? 0) === 1 ? "y" : "ies"} for ${payload.date ?? "today"}.`;
    }

    if (action.intent === "query_history") {
      const response = await fetch(`/api/entries?date=${action.date ?? ""}`);
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to query history.");
      const entries = payload.entries ?? [];
      return entries.length === 0
        ? `I couldn't find any nutrition entries for ${action.date ?? "that date"}.`
        : `${action.date ?? "That day"} had ${entries.reduce((sum, entry) => sum + entry.calories, 0)} calories across ${entries.length} item${entries.length === 1 ? "" : "s"}.`;
    }

    if (action.intent === "delete_entry" || action.intent === "update_entry" || action.intent === "undo_last") {
      return "I can handle that, but nutrition edit confirmations still live in the Nutrition workspace right now.";
    }

    return assistantMessage;
  }

  async function runActions(actions: AssistantAction[], userMessage: string, assistantMessage: string): Promise<string> {
    if (actions.length === 0) {
      return assistantMessage;
    }

    let finalMessage = assistantMessage;
    for (const action of actions) {
      finalMessage = await runAction(action, userMessage, finalMessage);
    }
    return finalMessage;
  }

  async function submit(raw?: string) {
    const outgoing = (raw ?? input).trim();
    if (!outgoing || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content: outgoing }];
    persistMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const storedFoods = localStorage.getItem(CUSTOM_FOODS_KEY);
      const customFoods = storedFoods ? (JSON.parse(storedFoods) as NutritionItem[]) : [];
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outgoing,
          recentMessages: nextMessages.slice(-12),
          customFoods,
        }),
      });

      const payload = (await response.json()) as Partial<AssistantResponse> & {
        action?: AssistantAction;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not process command.");
      }

      const actions = payload.actions ?? (payload.action ? [payload.action] : []);
      const assistantMessage = payload.message ?? payload.action?.reply ?? "I need a little more detail to help with that.";
      const finalMessage = await runActions(actions, outgoing, assistantMessage);

      persistMessages([...nextMessages, { role: "assistant", content: finalMessage }]);
    } catch (error) {
      persistMessages([
        ...nextMessages,
        { role: "assistant", content: error instanceof Error ? error.message : "Command failed." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <div className="rounded-2xl border border-cyan-400/30 bg-slate-950/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        {collapsible ? (
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
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Main AI chat</p>
              <h3 className="mt-1 text-xl font-semibold text-white">JARVIS Command</h3>
              <p className="mt-2 text-sm text-slate-300">Talk naturally. JARVIS will understand nutrition, gym, water, and to-do actions.</p>
            </div>
            <Brain size={18} className="text-cyan-200" />
          </div>
        )}

        {isOpen ? (
          <div className="space-y-3">
            <div className={`${collapsible ? "max-h-56" : "max-h-80"} overflow-y-auto space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3`}>
              {messages.length === 0 ? (
                <p className="text-sm text-slate-300">Try talking normally: &quot;I went to the gym today&quot;, &quot;I just drank a cup of water&quot;, or &quot;I need to remember to call Discount Tire&quot;.</p>
              ) : null}
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={message.role === "user" ? "text-right" : "text-left"}>
                  <div className={`inline-block max-w-[92%] rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "border border-cyan-400/30 bg-cyan-500/20" : "border border-slate-600 bg-slate-800/80"}`}>
                    {message.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void submit(item)}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-cyan-400"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                rows={collapsible ? 2 : 3}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Talk to JARVIS naturally..."
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => void submit()}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-500 text-black disabled:opacity-60"
                aria-label="Send command"
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
