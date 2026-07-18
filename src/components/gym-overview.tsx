"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Dumbbell, Flame, Save, Sparkles, TrendingUp } from "lucide-react";
import type { GymStatus, WorkoutType } from "@prisma/client";
import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";

type GymEntryView = {
  id: string;
  date: string;
  status: "PLANNED" | "COMPLETED" | "SKIPPED" | "MISSED";
  workoutType?: WorkoutType | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  cardioMinutes?: number | null;
  notes?: string | null;
  createdAt?: string;
};

type WorkoutDraft = {
  workoutType: WorkoutType;
  durationMinutes: number;
  cardioMinutes: number;
  notes: string;
};

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

function dayKeyFromIso(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function GymOverview() {
  const [entries, setEntries] = useState<GymEntryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [draft, setDraft] = useState<WorkoutDraft>({
    workoutType: "STRENGTH",
    durationMinutes: 45,
    cardioMinutes: 0,
    notes: "",
  });

  const monthKey = useMemo(() => chicagoDateString().slice(0, 7), []);
  const todayKey = useMemo(() => chicagoDateString(), []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/gym-entries?month=${monthKey}`);
      const payload = (await response.json()) as { entries?: GymEntryView[] };
      setEntries(payload.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEntries();
  }, [loadEntries]);

  const todayEntry = useMemo(
    () => entries.find((entry) => dayKeyFromIso(entry.date) === todayKey),
    [entries, todayKey],
  );

  const completed = useMemo(() => entries.filter((entry) => entry.status === "COMPLETED").length, [entries]);
  const missed = useMemo(() => entries.filter((entry) => entry.status === "MISSED").length, [entries]);
  const volume = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0) + (entry.cardioMinutes ?? 0), 0),
    [entries],
  );

  const trend = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = chicagoDateString(date);
      const day = entries.find((entry) => dayKeyFromIso(entry.date) === key);
      return {
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" }).format(date),
        status: day?.status,
      };
    });
  }, [entries]);

  const consistencyScore = useMemo(() => {
    const recent = trend.filter((day) => day.status);
    if (recent.length < 4) return null;
    const completedDays = recent.filter((day) => day.status === "COMPLETED").length;
    return Math.round((completedDays / recent.length) * 100);
  }, [trend]);

  async function upsertToday(payload: {
    status: GymStatus;
    workoutType?: WorkoutType | null;
    startTime?: string | null;
    endTime?: string | null;
    durationMinutes?: number | null;
    cardioMinutes?: number | null;
    notes?: string | null;
  }) {
    setSaving(true);
    try {
      const body = {
        date: `${todayKey}T12:00:00.000Z`,
        ...payload,
      };

      if (todayEntry) {
        await fetch(`/api/gym-entries/${todayEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/gym-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      await loadEntries();
    } finally {
      setSaving(false);
    }
  }

  const latestEntry = entries[0] ?? null;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Workout console"
        title="Gym"
        description="Track real workout outcomes and keep your calendar truthful."
      />

      <Surface className="p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void upsertToday({ status: "COMPLETED" })}
            className="rounded-xl border border-emerald-500/60 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100 disabled:opacity-60"
          >
            Mark went
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void upsertToday({ status: "MISSED" })}
            className="rounded-xl border border-rose-500/60 bg-rose-500/20 px-3 py-2 text-sm text-rose-100 disabled:opacity-60"
          >
            Mark missed
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void upsertToday({ status: "PLANNED", startTime: new Date().toISOString() })}
            className="rounded-xl border border-sky-500/60 bg-sky-500/20 px-3 py-2 text-sm text-sky-100 disabled:opacity-60"
          >
            Start workout
          </button>
          <button
            type="button"
            onClick={() => setShowLogForm((open) => !open)}
            className="rounded-xl border border-cyan-500/60 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100"
          >
            Log workout
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300">
          {todayEntry
            ? `Today: ${todayEntry.status.toLowerCase()}${todayEntry.workoutType ? ` • ${todayEntry.workoutType.toLowerCase()}` : ""}`
            : "No gym entry today. Mark went or missed."}
        </p>

        {showLogForm ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              Workout type
              <select
                value={draft.workoutType}
                onChange={(event) =>
                  setDraft((state) => ({ ...state, workoutType: event.target.value as WorkoutType }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              >
                <option value="STRENGTH">Strength</option>
                <option value="CARDIO">Cardio</option>
                <option value="MOBILITY">Mobility</option>
                <option value="HIIT">HIIT</option>
                <option value="SPORTS">Sports</option>
                <option value="RECOVERY">Recovery</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label className="text-sm text-slate-300">
              Duration (min)
              <input
                type="number"
                min={0}
                value={draft.durationMinutes}
                onChange={(event) =>
                  setDraft((state) => ({ ...state, durationMinutes: Number(event.target.value) || 0 }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm text-slate-300">
              Cardio (min)
              <input
                type="number"
                min={0}
                value={draft.cardioMinutes}
                onChange={(event) =>
                  setDraft((state) => ({ ...state, cardioMinutes: Number(event.target.value) || 0 }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm text-slate-300 sm:col-span-2">
              Notes
              <textarea
                rows={2}
                value={draft.notes}
                onChange={(event) => setDraft((state) => ({ ...state, notes: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void upsertToday({
                    status: "COMPLETED",
                    workoutType: draft.workoutType,
                    durationMinutes: draft.durationMinutes,
                    cardioMinutes: draft.cardioMinutes,
                    notes: draft.notes || null,
                    endTime: new Date().toISOString(),
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm text-black disabled:opacity-60"
              >
                <Save size={14} /> Save workout
              </button>
            </div>
          </div>
        ) : null}
      </Surface>

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { label: "Workouts", value: entries.length, icon: Dumbbell, tone: "text-sky-200" },
          { label: "Completed", value: completed, icon: Sparkles, tone: "text-emerald-200" },
          { label: "Missed", value: missed, icon: Flame, tone: "text-rose-200" },
          { label: "Volume", value: `${volume} min`, icon: TrendingUp, tone: "text-cyan-200" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Surface key={item.label} className="p-5">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-400">
                <span>{item.label}</span>
                <Icon size={14} className={item.tone} />
              </div>
              <p className={`mt-4 text-3xl font-semibold ${item.tone}`}>{item.value}</p>
            </Surface>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Workout calendar</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Completed vs missed</h2>
            </div>
            <CalendarDays size={18} className="text-sky-200" />
          </div>
          <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs text-slate-400">
            {trend.map((day) => {
              const isComplete = day.status === "COMPLETED";
              const isMissed = day.status === "MISSED" || day.status === "SKIPPED";

              return (
                <div key={day.label} className="space-y-2">
                  <div className="rounded-2xl bg-white/[0.04] px-2 py-6">
                    <motion.div
                      initial={{ scaleY: 0.2 }}
                      animate={{ scaleY: day.status ? 1 : 0.4 }}
                      className={`mx-auto h-10 w-3 rounded-full ${
                        isComplete ? "bg-emerald-300" : isMissed ? "bg-rose-300" : "bg-slate-500"
                      }`}
                    />
                  </div>
                  <p>{day.label}</p>
                </div>
              );
            })}
          </div>
        </Surface>

        <div className="space-y-4">
          <Surface className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Training consistency</p>
            <div className="mt-4 text-sm text-slate-300">
              {consistencyScore === null ? (
                <p>Not enough data. Log at least 4 days this week.</p>
              ) : (
                <p className="text-white">{consistencyScore}% of logged days were completed workouts.</p>
              )}
            </div>
          </Surface>

          <Surface className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Latest session</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {latestEntry ? (
                <>
                  <p className="text-white">{latestEntry.workoutType?.toLowerCase() ?? "Workout"}</p>
                  <p>
                    {latestEntry.durationMinutes ?? 0} min • {latestEntry.status.toLowerCase()}
                  </p>
                  {latestEntry.notes ? <p>{latestEntry.notes}</p> : null}
                </>
              ) : loading ? (
                <p>Loading workouts...</p>
              ) : (
                <p>No workout logged yet. Mark went or log a workout to begin.</p>
              )}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
