"use client";

import { useMemo, useRef, useState } from "react";
import { Brain, Send, Sparkles } from "lucide-react";
import type { AssistantAction, ChatMessage } from "@/types/chat";
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
      "Remind me to pick up groceries",
    ],
    [],
  );

  function persistMessages(next: ChatMessage[]) {
    setMessages(next);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next));
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function executeAction(action: AssistantAction, userMessage: string) {
    if (action.needsConfirmation && action.clarificationQuestion) {
      persistMessages([
        ...messages,
        { role: "assistant", content: `${action.reply}\n\n${action.clarificationQuestion}` },
      ]);
      return;
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
      persistMessages([...messages, { role: "assistant", content: `${action.reply}${breakdown}` }]);
      return;
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
      persistMessages([...messages, { role: "assistant", content: `${action.reply} Logged ${action.ounces} oz.` }]);
      return;
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
      persistMessages([...messages, { role: "assistant", content: action.reply }]);
      return;
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
      persistMessages([...messages, { role: "assistant", content: action.reply }]);
      return;
    }

    if (action.intent === "query_tasks") {
      const tasks = (data?.tasks ?? []).filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
      const content = tasks.length === 0
        ? "You have no open tasks right now."
        : `Open tasks:\n${tasks.slice(0, 6).map((task) => `- ${task.title}`).join("\n")}`;
      persistMessages([...messages, { role: "assistant", content }]);
      return;
    }

    if (action.intent === "query_today") {
      const calories = (data?.entriesToday ?? []).reduce((sum, entry) => sum + entry.calories, 0);
      const water = data?.waterTodayOunces ?? 0;
      const gym = (data?.gymCurrentMonth ?? []).find((entry) => entry.date.slice(0, 10) === (data?.todayKey ?? ""));
      persistMessages([
        ...messages,
        {
          role: "assistant",
          content: `Today: ${calories} calories, ${water} oz water, gym ${gym ? gym.status.toLowerCase() : "not logged"}.`,
        },
      ]);
      return;
    }

    if (action.intent === "query_history") {
      const response = await fetch(`/api/entries?date=${action.date ?? ""}`);
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to query history.");
      const entries = payload.entries ?? [];
      persistMessages([
        ...messages,
        {
          role: "assistant",
          content: entries.length === 0
            ? `No nutrition entries found for ${action.date ?? "that date"}.`
            : `${action.date ?? "That day"}: ${entries.reduce((sum, entry) => sum + entry.calories, 0)} calories across ${entries.length} items.`,
        },
      ]);
      return;
    }

    if (action.intent === "delete_entry" || action.intent === "update_entry" || action.intent === "undo_last") {
      persistMessages([
        ...messages,
        { role: "assistant", content: "Nutrition edit confirmations still live in the Nutrition workspace. Open Nutrition to complete that action." },
      ]);
      return;
    }

    persistMessages([...messages, { role: "assistant", content: action.reply }]);
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

      const payload = (await response.json()) as { action?: AssistantAction; error?: string };
      if (!response.ok || !payload.action) {
        throw new Error(payload.error ?? "Could not process command.");
      }

      await executeAction(payload.action, outgoing);
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
              <p className="mt-2 text-sm text-slate-300">Nutrition, gym, water, and to-do actions all run here.</p>
            </div>
            <Brain size={18} className="text-cyan-200" />
          </div>
        )}

        {isOpen ? (
          <div className="space-y-3">
            <div className={`${collapsible ? "max-h-56" : "max-h-80"} overflow-y-auto space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3`}>
              {messages.length === 0 ? (
                <p className="text-sm text-slate-300">Try: &quot;I went to the gym today&quot;, &quot;I drank a cup of water&quot;, or &quot;Remind me to call the dentist&quot;.</p>
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
                placeholder="Tell JARVIS what you did..."
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
