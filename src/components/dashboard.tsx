"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Send,
  Settings,
  Trash2,
  Pencil,
  Save,
  X,
  Flame,
  Sparkles,
  Upload,
} from "lucide-react";
import type { AssistantAction, ChatMessage } from "@/types/chat";
import type { CalorieEntryCreateInput, CalorieEntryRecord, MealType, NutritionItem } from "@/types/nutrition";
import { mergeCatalogs, parseIngredientTotals } from "@/lib/nutrition";

const DEFAULT_GOAL = 1200;
const CHAT_STORAGE_KEY = "jarvis-chat-history-v1";
const GOAL_STORAGE_KEY = "jarvis-daily-goal-v1";
const CUSTOM_FOODS_KEY = "jarvis-custom-foods-v1";
const SUGGESTIONS = [
  "How many calories left?",
  "Show today's food",
  "Undo my last entry",
  "What did I eat yesterday?",
];

type Toast = { id: string; text: string };
type ConfirmationAction =
  | { type: "delete"; entryId: string; summary: string }
  | { type: "undo"; entryId: string; summary: string }
  | { type: "update"; entryId: string; patch: Partial<CalorieEntryCreateInput>; summary: string };

function chicagoDateString(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function Dashboard() {
  const [entries, setEntries] = useState<CalorieEntryRecord[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    const storedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!storedMessages) return [];

    try {
      return JSON.parse(storedMessages) as ChatMessage[];
    } catch {
      return [];
    }
  });
  const [customFoods, setCustomFoods] = useState<NutritionItem[]>(() => {
    if (typeof window === "undefined") return [];
    const storedFoods = localStorage.getItem(CUSTOM_FOODS_KEY);
    if (!storedFoods) return [];

    try {
      return JSON.parse(storedFoods) as NutritionItem[];
    } catch {
      return [];
    }
  });
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_GOAL;
    const storedGoal = localStorage.getItem(GOAL_STORAGE_KEY);
    const parsedGoal = storedGoal ? Number(storedGoal) : NaN;
    if (Number.isFinite(parsedGoal) && parsedGoal > 0) {
      return parsedGoal;
    }
    return DEFAULT_GOAL;
  });
  const [input, setInput] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ConfirmationAction | null>(null);
  const [uploadPreview, setUploadPreview] = useState<NutritionItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<CalorieEntryCreateInput>>({});

  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const todayString = useMemo(() => chicagoDateString(), []);
  const todayCalories = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.calories, 0),
    [entries],
  );
  const remaining = Math.max(0, dailyGoal - todayCalories);
  const progressPercent = Math.min(100, Math.round((todayCalories / dailyGoal) * 100));

  const pushToast = (text: string) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2800);
  };

  const persistMessages = (nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(nextMessages));
  };

  const loadTodayEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      const response = await fetch(`/api/entries?date=${todayString}`);
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load entries");
      }
      setEntries(payload.entries ?? []);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed loading entries");
    } finally {
      setLoadingEntries(false);
    }
  }, [todayString]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadTodayEntries();
  }, [loadTodayEntries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function executeLogFood(action: Extract<AssistantAction, { intent: "log_food" }>) {
    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: action.entries }),
    });

    const payload = (await response.json()) as {
      entries?: CalorieEntryRecord[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to log food");
    }

    await loadTodayEntries();
    pushToast(`Logged ${action.entries.length} food entr${action.entries.length > 1 ? "ies" : "y"}.`);
  }

  async function executePendingConfirmation(confirmed: boolean) {
    if (!pending) return;

    if (!confirmed) {
      setPending(null);
      persistMessages([
        ...messages,
        { role: "assistant", content: "No changes made. I canceled that action." },
      ]);
      return;
    }

    try {
      if (pending.type === "delete" || pending.type === "undo") {
        const response = await fetch(`/api/entries/${pending.entryId}`, {
          method: "DELETE",
        });

        const payload = (await response.json()) as { success?: boolean; error?: string };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error ?? "Delete failed");
        }
        pushToast("Entry deleted.");
      }

      if (pending.type === "update") {
        const response = await fetch(`/api/entries/${pending.entryId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending.patch),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Update failed");
        }
        pushToast("Entry updated.");
      }

      await loadTodayEntries();
      persistMessages([
        ...messages,
        {
          role: "assistant",
          content: `Confirmed. ${pending.summary}`,
        },
      ]);
      setPending(null);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Action failed");
    }
  }

  async function handleAssistantAction(action: AssistantAction, userMessage: string) {
    if (action.needsConfirmation && action.clarificationQuestion) {
      persistMessages([
        ...messages,
        { role: "assistant", content: `${action.reply}\n\n${action.clarificationQuestion}` },
      ]);
      return;
    }

    if (action.intent === "log_food") {
      await executeLogFood(action);

      const mergedCatalog = mergeCatalogs(customFoods);
      const parsed = parseIngredientTotals(userMessage, mergedCatalog);
      const breakdown =
        parsed.lines.length > 0
          ? `\n\n${parsed.lines
              .map((line) => `${line.quantity > 1 ? `${line.quantity}x ` : ""}${line.name} — ${line.calories} cal`)
              .join("\n")}\n\nTotal: ${parsed.totalCalories} calories`
          : "";

      persistMessages([
        ...messages,
        { role: "assistant", content: `${action.reply}${breakdown}` },
      ]);
      return;
    }

    if (action.intent === "query_today") {
      const total = entries.reduce((sum, entry) => sum + entry.calories, 0);
      const foods = entries.map((entry) => `${entry.food} (${entry.calories} cal)`).join(", ");
      persistMessages([
        ...messages,
        {
          role: "assistant",
          content:
            entries.length === 0
              ? "You have not logged any foods today yet."
              : `Today: ${total} / ${dailyGoal} calories. Foods: ${foods}`,
        },
      ]);
      return;
    }

    if (action.intent === "query_history") {
      let fallbackDate = new Date();
      fallbackDate = new Date(fallbackDate.setDate(fallbackDate.getDate() - 1));

      const targetDate = action.date && /^\d{4}-\d{2}-\d{2}$/.test(action.date)
        ? action.date
        : chicagoDateString(fallbackDate);
      const response = await fetch(`/api/entries?date=${targetDate}`);
      const payload = (await response.json()) as { entries?: CalorieEntryRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to fetch history");
      }
      const rows = payload.entries ?? [];
      const total = rows.reduce((sum, row) => sum + row.calories, 0);
      const details = rows.map((row) => `${row.food} (${row.calories} cal)`).join(", ");
      persistMessages([
        ...messages,
        {
          role: "assistant",
          content:
            rows.length === 0
              ? `No entries found for ${targetDate}.`
              : `${targetDate}: ${total} calories across ${rows.length} items. ${details}`,
        },
      ]);
      return;
    }

    if (action.intent === "delete_entry") {
      const match = entries.find((entry) => {
        const text = action.searchText?.toLowerCase() ?? "";
        return text.length === 0 || entry.food.toLowerCase().includes(text);
      }) ?? entries[0];

      if (!match) {
        persistMessages([
          ...messages,
          { role: "assistant", content: "I could not find an entry to delete." },
        ]);
        return;
      }

      setPending({
        type: "delete",
        entryId: match.id,
        summary: `Deleted ${match.food} (${match.calories} cal).`,
      });

      persistMessages([
        ...messages,
        {
          role: "assistant",
          content: `I found ${match.food} (${match.calories} cal). Confirm deletion below.`,
        },
      ]);
      return;
    }

    if (action.intent === "undo_last") {
      const latest = [...entries].sort((a, b) => b.created_date.localeCompare(a.created_date))[0];
      if (!latest) {
        persistMessages([
          ...messages,
          { role: "assistant", content: "There is no recent entry to undo." },
        ]);
        return;
      }
      setPending({
        type: "undo",
        entryId: latest.id,
        summary: `Undid ${latest.food} (${latest.calories} cal).`,
      });

      persistMessages([
        ...messages,
        {
          role: "assistant",
          content: `Ready to undo your last entry: ${latest.food} (${latest.calories} cal). Confirm below.`,
        },
      ]);
      return;
    }

    if (action.intent === "update_entry") {
      const latest = [...entries].sort((a, b) => b.created_date.localeCompare(a.created_date))[0];
      if (!latest) {
        persistMessages([
          ...messages,
          { role: "assistant", content: "I could not find a recent entry to update." },
        ]);
        return;
      }

      const patch: Partial<CalorieEntryCreateInput> = {};
      if (typeof action.calories === "number") patch.calories = action.calories;
      if (action.food) patch.food = action.food;
      if (action.meal) patch.meal = action.meal;

      if (action.quantity && latest.calories > 0 && !patch.calories) {
        patch.calories = Math.round(latest.calories * action.quantity);
      }

      if (Object.keys(patch).length === 0) {
        persistMessages([
          ...messages,
          { role: "assistant", content: "Please clarify what to update in the entry." },
        ]);
        return;
      }

      setPending({
        type: "update",
        entryId: latest.id,
        patch,
        summary: `Updated ${latest.food}.`,
      });

      persistMessages([
        ...messages,
        {
          role: "assistant",
          content: `I can update your latest entry (${latest.food}). Confirm below to apply changes.`,
        },
      ]);
      return;
    }

    persistMessages([
      ...messages,
      { role: "assistant", content: action.reply },
    ]);
  }

  async function sendMessage(message?: string) {
    const outgoing = (message ?? input).trim();
    if (!outgoing || loadingChat) return;

    const nextMessages = [...messages, { role: "user" as const, content: outgoing }];
    persistMessages(nextMessages);
    setInput("");
    setLoadingChat(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outgoing,
          recentMessages: nextMessages.slice(-12),
          customFoods,
        }),
      });

      const payload = (await response.json()) as {
        action?: AssistantAction;
        error?: string;
      };

      if (!response.ok || !payload.action) {
        throw new Error(payload.error ?? "Could not process message.");
      }

      await handleAssistantAction(payload.action, outgoing);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to send message");
      persistMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "I hit an error while processing that request. Please try again.",
        },
      ]);
    } finally {
      setLoadingChat(false);
    }
  }

  async function deleteEntryFromList(entry: CalorieEntryRecord) {
    const confirmed = window.confirm(`Delete ${entry.food} (${entry.calories} cal)?`);
    if (!confirmed) return;

    const response = await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
    const payload = (await response.json()) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      pushToast(payload.error ?? "Failed to delete entry");
      return;
    }
    pushToast("Entry deleted.");
    await loadTodayEntries();
  }

  function startEdit(entry: CalorieEntryRecord) {
    setEditingId(entry.id);
    setEditState({
      food: entry.food,
      calories: entry.calories,
      meal: entry.meal,
    });
  }

  async function saveEdit(id: string) {
    const response = await fetch(`/api/entries/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editState),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      pushToast(payload.error ?? "Update failed");
      return;
    }

    setEditingId(null);
    setEditState({});
    pushToast("Entry updated.");
    await loadTodayEntries();
  }

  async function clearDay() {
    const confirmed = window.confirm("Clear all entries for today?");
    if (!confirmed) return;

    for (const entry of entries) {
      await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
    }
    await loadTodayEntries();
    pushToast("Today cleared.");
  }

  function parseMenuFile(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase();

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");

      if (extension === "json") {
        try {
          const parsed = JSON.parse(content) as Array<Omit<NutritionItem, "id">>;
          const foods = parsed.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
            aliases: item.aliases ?? [],
          }));
          setUploadPreview(foods);
        } catch {
          pushToast("Invalid JSON format.");
        }
        return;
      }

      if (extension === "csv") {
        const parsed = Papa.parse<Record<string, string>>(content, {
          header: true,
          skipEmptyLines: true,
        });

        const foods = parsed.data
          .filter((row) => row.name && row.calories)
          .map((row) => ({
            id: crypto.randomUUID(),
            name: row.name,
            aliases: row.aliases ? row.aliases.split("|").map((alias) => alias.trim()) : [],
            restaurant: row.restaurant,
            servingSize: row.servingSize || "1 serving",
            calories: Number(row.calories),
            protein: row.protein ? Number(row.protein) : undefined,
            carbs: row.carbs ? Number(row.carbs) : undefined,
            fat: row.fat ? Number(row.fat) : undefined,
            fiber: row.fiber ? Number(row.fiber) : undefined,
          }))
          .filter((row) => Number.isFinite(row.calories));

        setUploadPreview(foods);
        return;
      }

      const foods = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("|").map((part) => part.trim());
          const name = parts[0] ?? "";
          const calories = Number(parts[1] ?? "");
          const aliases = parts[2] ? parts[2].split(",").map((alias) => alias.trim()) : [];

          return {
            id: crypto.randomUUID(),
            name,
            aliases,
            servingSize: parts[3] || "1 serving",
            calories,
            restaurant: parts[4] || undefined,
          } as NutritionItem;
        })
        .filter((food) => food.name && Number.isFinite(food.calories));

      setUploadPreview(foods);
    };

    reader.readAsText(file);
  }

  function importPreviewFoods() {
    const merged = [...customFoods, ...uploadPreview];
    setCustomFoods(merged);
    localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(merged));
    pushToast(`Imported ${uploadPreview.length} custom foods.`);
    setUploadPreview([]);
  }

  function removeCustomFood(id: string) {
    const next = customFoods.filter((food) => food.id !== id);
    setCustomFoods(next);
    localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(next));
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f3b60_0%,_#090d14_35%,_#05070b_100%)] text-slate-100 px-4 pb-24 pt-4">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="rounded-2xl border border-sky-500/30 bg-slate-900/55 p-4 backdrop-blur-xl shadow-[0_0_40px_rgba(56,189,248,0.12)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-wide text-sky-200">JARVIS Calories</h1>
              <p className="text-sm text-slate-300">{formatDisplayDate()}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:border-sky-500"
              >
                <Settings size={16} />
                Settings
              </button>
              <button
                type="button"
                onClick={clearDay}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/60 bg-red-950/40 px-3 py-2 text-sm hover:bg-red-900/60"
              >
                <Trash2 size={16} />
                Clear Day
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-sky-500/25 bg-slate-900/55 p-4 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-slate-800/60 p-3">
              <p className="text-slate-400">Consumed</p>
              <p className="text-xl font-semibold">{todayCalories}</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-3">
              <p className="text-slate-400">Goal</p>
              <p className="text-xl font-semibold">{dailyGoal}</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-3">
              <p className="text-slate-400">Remaining</p>
              <p className="text-xl font-semibold">{remaining}</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-3">
              <p className="text-slate-400">Foods Logged</p>
              <p className="text-xl font-semibold">{entries.length}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
              <span className="inline-flex items-center gap-2"><Flame size={14} /> Daily Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                style={{ width: `${progressPercent}%` }}
                aria-label="Daily calories progress"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-sky-500/25 bg-slate-900/55 backdrop-blur-xl">
            <div className="border-b border-slate-700/60 px-4 py-3 text-sm font-medium text-sky-200">Assistant</div>
            <div className="max-h-[46vh] min-h-[34vh] overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300">
                  No entries yet. Try: &quot;I ate a Chipotle bowl with lettuce base, double chicken, pico, and green salsa&quot;.
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={message.role === "user" ? "text-right" : "text-left"}
                >
                  <div
                    className={`inline-block max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      message.role === "user"
                        ? "bg-cyan-500/20 border border-cyan-400/30"
                        : "bg-slate-800/80 border border-slate-600"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {pending && (
                <div className="rounded-xl border border-amber-400/60 bg-amber-900/20 p-3 text-sm">
                  <p className="mb-2 text-amber-200">Pending confirmation</p>
                  <p className="mb-3 text-amber-100">{pending.summary}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => executePendingConfirmation(true)}
                      className="rounded-lg bg-amber-400 px-3 py-1.5 text-black"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => executePendingConfirmation(false)}
                      className="rounded-lg border border-amber-400/80 px-3 py-1.5 text-amber-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div ref={messagesBottomRef} />
            </div>

            <div className="border-t border-slate-700/60 px-4 py-3">
              <div className="mb-2 flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-cyan-400"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="sticky bottom-2 rounded-xl border border-slate-700 bg-slate-950/80 p-2">
                <label htmlFor="chat-input" className="sr-only">
                  Message JARVIS
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    id="chat-input"
                    ref={textAreaRef}
                    rows={2}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="Tell JARVIS what you ate..."
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    disabled={loadingChat}
                    onClick={() => sendMessage()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500 text-black disabled:opacity-50"
                    aria-label="Send message"
                  >
                    {loadingChat ? <Sparkles className="animate-pulse" size={16} /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-sky-500/25 bg-slate-900/55 backdrop-blur-xl">
            <div className="border-b border-slate-700/60 px-4 py-3 text-sm font-medium text-sky-200">Today&apos;s Entries</div>
            <div className="max-h-[62vh] overflow-y-auto px-4 py-4 space-y-3">
              {loadingEntries && <p className="text-sm text-slate-300">Loading entries...</p>}
              {!loadingEntries && entries.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-300">
                  Nothing logged yet. Ask JARVIS to log your first meal.
                </div>
              )}

              {entries.map((entry) => {
                const created = new Date(entry.created_date);
                const time = new Intl.DateTimeFormat("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/Chicago",
                }).format(created);

                const isEditing = editingId === entry.id;

                return (
                  <article key={entry.id} className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                    {!isEditing ? (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-medium text-slate-100">{entry.food}</h3>
                            <p className="text-xs text-slate-300">{entry.calories} cal • {entry.meal} • {time}</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded-md border border-slate-600 p-2 hover:border-cyan-400"
                              onClick={() => startEdit(entry)}
                              aria-label="Edit entry"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-red-700 p-2 hover:border-red-500"
                              onClick={() => void deleteEntryFromList(entry)}
                              aria-label="Delete entry"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={editState.food ?? ""}
                          onChange={(event) => setEditState((state) => ({ ...state, food: event.target.value }))}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          aria-label="Food name"
                        />
                        <input
                          type="number"
                          min={0}
                          value={editState.calories ?? 0}
                          onChange={(event) =>
                            setEditState((state) => ({ ...state, calories: Number(event.target.value) }))
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          aria-label="Calories"
                        />
                        <select
                          value={editState.meal ?? "Snack"}
                          onChange={(event) =>
                            setEditState((state) => ({ ...state, meal: event.target.value as MealType }))
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          aria-label="Meal"
                        >
                          <option>Breakfast</option>
                          <option>Lunch</option>
                          <option>Dinner</option>
                          <option>Snack</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit(entry.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-1.5 text-black"
                          >
                            <Save size={14} /> Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditState({});
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5"
                          >
                            <X size={14} /> Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 p-4">
          <div className="mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-sky-500/30 bg-slate-950 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-sky-200">Settings</h2>
              <button
                type="button"
                className="rounded-md border border-slate-600 p-2"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-5">
              <section>
                <label htmlFor="goal" className="mb-1 block text-sm text-slate-300">Daily calorie goal</label>
                <div className="flex gap-2">
                  <input
                    id="goal"
                    type="number"
                    min={1}
                    value={dailyGoal}
                    onChange={(event) => setDailyGoal(round(Number(event.target.value) || DEFAULT_GOAL))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-cyan-500 px-3 py-2 text-sm text-black"
                    onClick={() => {
                      localStorage.setItem(GOAL_STORAGE_KEY, String(dailyGoal));
                      pushToast("Saved calorie goal.");
                    }}
                  >
                    Save
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-200">Upload custom menu (JSON, CSV, TXT)</h3>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
                  <Upload size={14} />
                  Select file
                  <input
                    type="file"
                    accept=".json,.csv,.txt"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) parseMenuFile(file);
                    }}
                  />
                </label>

                {uploadPreview.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-700 p-3">
                    <p className="mb-2 text-sm text-slate-300">Preview ({uploadPreview.length} foods)</p>
                    <div className="max-h-28 overflow-y-auto text-xs text-slate-300">
                      {uploadPreview.map((food) => (
                        <p key={food.id}>{food.name} - {food.calories} cal</p>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm text-black"
                      onClick={importPreviewFoods}
                    >
                      Import foods
                    </button>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-200">Imported foods</h3>
                {customFoods.length === 0 ? (
                  <p className="text-sm text-slate-400">No imported foods yet.</p>
                ) : (
                  <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-700 p-3">
                    {customFoods.map((food) => (
                      <div key={food.id} className="flex items-center justify-between gap-2 text-sm">
                        <p>{food.name} ({food.calories} cal)</p>
                        <button
                          type="button"
                          className="rounded-md border border-red-600 p-1"
                          onClick={() => removeCustomFood(food.id)}
                          aria-label={`Delete ${food.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      <div className="fixed right-3 top-3 z-30 space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-lg border border-cyan-400/50 bg-slate-900/95 px-3 py-2 text-xs text-cyan-100 shadow-lg">
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}
