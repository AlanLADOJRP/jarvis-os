"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Dumbbell, Flame, Sparkles, TrendingUp } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";

type GymEntryView = {
  id: string;
  date: string;
  status: "PLANNED" | "COMPLETED" | "SKIPPED" | "MISSED";
  workoutType?: string | null;
  durationMinutes?: number | null;
  cardioMinutes?: number | null;
  notes?: string | null;
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

export function GymOverview() {
  const [entries, setEntries] = useState<GymEntryView[]>([]);
  const monthKey = useMemo(() => chicagoDateString().slice(0, 7), []);

  useEffect(() => {
    fetch(`/api/gym-entries?month=${monthKey}`)
      .then(async (response) => {
        const payload = (await response.json()) as { entries?: GymEntryView[] };
        setEntries(payload.entries ?? []);
      })
      .catch(() => setEntries([]));
  }, [monthKey]);

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
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(date)
        .reduce(
          (accumulator, part) => ({
            ...accumulator,
            [part.type]: part.value,
          }),
          {} as Record<string, string>,
        );
      const day = entries.find((entry) => entry.date.slice(0, 10) === `${key.year}-${key.month}-${key.day}`);
      return {
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" }).format(date),
        completed: day?.status === "COMPLETED" ? 1 : 0,
      };
    });
  }, [entries]);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Workout console"
        title="Gym"
        description="Track workouts, calendars, streaks, and recovery without making the app feel like a spreadsheet."
      />

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
            {trend.map((day) => (
              <div key={day.label} className="space-y-2">
                <div className="rounded-2xl bg-white/[0.04] px-2 py-6">
                  <motion.div
                    initial={{ scaleY: 0.2 }}
                    animate={{ scaleY: day.completed ? 1 : 0.4 }}
                    className={`mx-auto h-10 w-3 rounded-full ${day.completed ? "bg-emerald-300" : "bg-rose-300"}`}
                  />
                </div>
                <p>{day.label}</p>
              </div>
            ))}
          </div>
        </Surface>

        <div className="space-y-4">
          <Surface className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Recovery score</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-2xl font-semibold text-white">86</div>
              <div className="text-sm text-slate-300">
                Good readiness. Keep cardio light and push strength tomorrow.
              </div>
            </div>
          </Surface>

          <Surface className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Latest session</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {entries[0] ? (
                <>
                  <p className="text-white">{entries[0].workoutType ?? "Workout"}</p>
                  <p>{entries[0].durationMinutes ?? 0} min • {entries[0].status.toLowerCase()}</p>
                  {entries[0].notes ? <p>{entries[0].notes}</p> : null}
                </>
              ) : (
                <p>No workout logged yet.</p>
              )}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
