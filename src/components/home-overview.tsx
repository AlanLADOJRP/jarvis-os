"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Dumbbell,
  Flame,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";
import { useDashboardData } from "@/lib/dashboard-client";
import type { CalorieEntryRecord } from "@/types/nutrition";
import type { GymEntryView } from "@/types/dashboard";
import { JarvisCommandPanel } from "@/components/jarvis-command-panel";
import { TodoListPanel } from "@/components/todo-list-panel";

const GOAL_STORAGE_KEY = "jarvis-daily-goal-v1";
const EMPTY_ENTRIES: CalorieEntryRecord[] = [];
const EMPTY_GYM_ENTRIES: GymEntryView[] = [];

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

function chicagoDayKeyFromIso(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value ?? "12",
  );

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function statTone(value: number, goal: number) {
  if (value <= 0) return "text-slate-400";
  if (value >= goal) return "text-emerald-300";
  if (value >= goal * 0.85) return "text-amber-200";
  return "text-cyan-200";
}

function calculateConsecutiveStreak(dayKeys: string[], today: string): number {
  if (dayKeys.length === 0) return 0;

  const uniqueDays = new Set(dayKeys);
  let streak = 0;
  const cursor = new Date(`${today}T12:00:00`);

  while (true) {
    const key = chicagoDateString(cursor);
    if (!uniqueDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function HomeOverview() {
  const { data, loading } = useDashboardData();

  const [dailyGoal] = useState(() => {
    if (typeof window === "undefined") return 1200;
    const storedGoal = Number(localStorage.getItem(GOAL_STORAGE_KEY) ?? "1200");
    return Number.isFinite(storedGoal) && storedGoal > 0 ? storedGoal : 1200;
  });

  const todayEntries = useMemo(() => data?.entriesToday ?? EMPTY_ENTRIES, [data]);
  const monthEntries = useMemo(() => data?.entriesCurrentMonth ?? EMPTY_ENTRIES, [data]);
  const streakEntries = useMemo(
    () => (data ? [...data.entriesPreviousMonth, ...data.entriesCurrentMonth] : EMPTY_ENTRIES),
    [data],
  );
  const monthGymEntries = useMemo(() => data?.gymCurrentMonth ?? EMPTY_GYM_ENTRIES, [data]);
  const streakGymEntries = useMemo(
    () => (data ? [...data.gymPreviousMonth, ...data.gymCurrentMonth] : EMPTY_GYM_ENTRIES),
    [data],
  );

  const todayKey = data?.todayKey ?? chicagoDateString();
  const calories = useMemo(() => todayEntries.reduce((sum, entry) => sum + entry.calories, 0), [todayEntries]);
  const protein = useMemo(() => todayEntries.reduce((sum, entry) => sum + (entry.protein ?? 0), 0), [todayEntries]);
  const remaining = Math.max(0, dailyGoal - calories);

  const gymToday = useMemo(
    () => monthGymEntries.find((entry) => chicagoDayKeyFromIso(entry.date) === todayKey),
    [monthGymEntries, todayKey],
  );

  const nutritionStreak = useMemo(() => {
    const daysWithFood = streakEntries.map((entry) => chicagoDayKeyFromIso(entry.loggedAt));
    return calculateConsecutiveStreak(daysWithFood, todayKey);
  }, [streakEntries, todayKey]);

  const gymStreak = useMemo(() => {
    const completedDays = streakGymEntries
      .filter((entry) => entry.status === "COMPLETED")
      .map((entry) => chicagoDayKeyFromIso(entry.date));
    return calculateConsecutiveStreak(completedDays, todayKey);
  }, [streakGymEntries, todayKey]);

  const weeklyTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const key = chicagoDateString(day);
      return {
        key,
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" }).format(day),
        calories: monthEntries
          .filter((entry) => chicagoDayKeyFromIso(entry.loggedAt) === key)
          .reduce((sum, entry) => sum + entry.calories, 0),
      };
    });
  }, [monthEntries]);

  const maxTrend = Math.max(1, ...weeklyTrend.map((day) => day.calories));

  const recommendations = useMemo(() => {
    const next: string[] = [];

    if (todayEntries.length === 0) {
      next.push("No nutrition data yet. Log your first meal to start daily tracking.");
    } else {
      if (protein < 120) {
        next.push(`Protein is ${Math.round(protein)}g today. Add ${Math.max(0, 120 - Math.round(protein))}g to reach target.`);
      }
      if (calories < dailyGoal * 0.7) {
        next.push(`Calories are ${remaining} below goal. Log your next meal when you eat.`);
      }
    }

    if (!gymToday) {
      next.push("No gym entry today. Mark went or missed in the Gym module.");
    }

    if (next.length === 0) {
      next.push("You have enough data for today. Keep logging consistently.");
    }

    return next.slice(0, 3);
  }, [todayEntries, protein, calories, dailyGoal, remaining, gymToday]);

  const briefing = useMemo(() => {
    if (todayEntries.length === 0 && !gymToday) {
      return "No nutrition or gym data yet today. Start by logging a meal or marking gym status.";
    }

    const gymText = gymToday ? `Gym: ${gymToday.status.toLowerCase()}.` : "Gym: no entry yet.";
    return `Calories: ${calories}/${dailyGoal}. Protein: ${Math.round(protein)}g. ${gymText}`;
  }, [todayEntries, gymToday, calories, dailyGoal, protein]);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Control center"
        title={`${formatGreeting()}, Alan.`}
        description={loading ? "Loading dashboard..." : todayEntries.length === 0 ? "No nutrition data yet today." : `You are ${remaining} calories below your current goal.`}
        action={
          <Link
            href="/nutrition"
            prefetch={false}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/15"
          >
            Open Nutrition
            <ArrowRight size={16} />
          </Link>
        }
      />

      <Surface className="p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.34em] text-slate-400">
              <Sparkles size={12} />
              AI Summary
            </div>
            <div>
              <p className="text-sm text-slate-300">Today&apos;s briefing</p>
              <h2 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {loading ? "Loading..." : todayEntries.length === 0 ? "No data yet." : `${remaining} calories remaining.`}
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">{briefing}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Log a meal",
                "Mark gym status",
                "Use global command",
              ].map((label) => (
                <span key={label} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              { label: "Calories", value: `${calories}`, tone: statTone(calories, dailyGoal), icon: Flame },
              { label: "Protein", value: `${Math.round(protein)}g`, tone: statTone(protein, 120), icon: Target },
              {
                label: "Gym",
                value: gymToday ? gymToday.status.toLowerCase() : "No data yet",
                tone: gymToday?.status === "COMPLETED" ? "text-emerald-300" : "text-slate-300",
                icon: Dumbbell,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-400">
                    <span>{item.label}</span>
                    <Icon size={14} className={item.tone} />
                  </div>
                  <p className={`mt-4 text-3xl font-semibold ${item.tone}`}>{item.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <JarvisCommandPanel />
        <TodoListPanel compact />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Surface className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Weekly nutrition trend</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Last 7 days</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              {dailyGoal} goal
            </span>
          </div>
          <div className="mt-6 flex h-56 items-end gap-3">
            {weeklyTrend.map((day) => {
              const height = Math.max(8, Math.round((day.calories / maxTrend) * 100));
              return (
                <div key={day.key} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end justify-center rounded-[22px] bg-white/[0.03] p-2">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                      className="w-full rounded-[18px] bg-[linear-gradient(180deg,rgba(34,211,238,0.9),rgba(59,130,246,0.5))]"
                    />
                  </div>
                  <span className="text-xs text-slate-400">{day.label}</span>
                </div>
              );
            })}
          </div>
        </Surface>

        <div className="space-y-4">
          <Surface className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">AI recommendations</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              {recommendations.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Brain size={16} className="mt-0.5 text-cyan-300" />
                  {item}
                </li>
              ))}
            </ul>
          </Surface>

          <Surface className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">System streaks</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-slate-400">Nutrition</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {nutritionStreak > 0 ? `${nutritionStreak} day${nutritionStreak === 1 ? "" : "s"}` : "No data yet"}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-slate-400">Gym</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {gymStreak > 0 ? `${gymStreak} day${gymStreak === 1 ? "" : "s"}` : "No data yet"}
                </p>
              </div>
            </div>
          </Surface>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { label: "Nutrition", href: "/nutrition", copy: `${todayEntries.length} meals logged today`, icon: Sparkles },
          {
            label: "Gym",
            href: "/gym",
            copy: gymToday ? `Today: ${gymToday.status.toLowerCase()}` : "No gym entry today",
            icon: Dumbbell,
          },
          { label: "To-Do", href: "/tasks", copy: `${(data?.tasks ?? []).filter((task) => task.status !== "DONE" && task.status !== "CANCELED").length} open tasks`, icon: Workflow },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} prefetch={false}>
              <Surface className="group p-5 transition hover:border-cyan-400/30 hover:bg-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Module</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{item.label}</h3>
                  </div>
                  <Icon size={18} className="text-cyan-200" />
                </div>
                <p className="mt-4 text-sm text-slate-300">{item.copy}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-200">
                  Open
                  <ArrowRight size={14} className="transition group-hover:translate-x-1" />
                </div>
              </Surface>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
