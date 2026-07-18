"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  Dumbbell,
  Flame,
  Target,
  Droplets,
  ListTodo,
  Sparkles,
} from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";
import type { CalorieEntryRecord } from "@/types/nutrition";

const GOAL_STORAGE_KEY = "jarvis-daily-goal-v1";

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

export function HomeOverview() {
  const [todayEntries, setTodayEntries] = useState<CalorieEntryRecord[]>([]);
  const [monthEntries, setMonthEntries] = useState<CalorieEntryRecord[]>([]);
  const [dailyGoal] = useState(() => {
    if (typeof window === "undefined") return 1200;
    const storedGoal = Number(localStorage.getItem(GOAL_STORAGE_KEY) ?? "1200");
    return Number.isFinite(storedGoal) && storedGoal > 0 ? storedGoal : 1200;
  });

  useEffect(() => {
    const today = chicagoDateString();
    const month = today.slice(0, 7);

    Promise.all([
      fetch(`/api/entries?date=${today}`),
      fetch(`/api/entries?month=${month}`),
    ])
      .then(async ([todayResponse, monthResponse]) => {
        const todayPayload = (await todayResponse.json()) as { entries?: CalorieEntryRecord[] };
        const monthPayload = (await monthResponse.json()) as { entries?: CalorieEntryRecord[] };
        setTodayEntries(todayPayload.entries ?? []);
        setMonthEntries(monthPayload.entries ?? []);
      })
      .catch(() => {
        setTodayEntries([]);
        setMonthEntries([]);
      });
  }, []);

  const calories = useMemo(() => todayEntries.reduce((sum, entry) => sum + entry.calories, 0), [todayEntries]);
  const protein = useMemo(() => todayEntries.reduce((sum, entry) => sum + (entry.protein ?? 0), 0), [todayEntries]);
  const underGoal = Math.max(0, dailyGoal - calories);

  const weeklyTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const key = chicagoDateString(day);
      return {
        key,
        label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" }).format(day),
        calories: monthEntries
          .filter((entry) => entry.loggedAt.slice(0, 10) === key)
          .reduce((sum, entry) => sum + entry.calories, 0),
      };
    });
  }, [monthEntries]);

  const maxTrend = Math.max(1, ...weeklyTrend.map((day) => day.calories));

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Control center"
        title={`${formatGreeting()}, Alan.`}
        description={`You're ${underGoal} calories under your goal. This is your operating system home screen, not a tracker.`}
        action={
          <Link
            href="/nutrition"
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
                You&apos;re {underGoal} calories under goal.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
                You still need <span className="text-white">{Math.max(0, 120 - protein)}g protein</span>, you haven&apos;t gone to the gym yet, and your next best move is to keep the day clean.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Log a meal",
                "Start gym session",
                "Add water",
                "Create a task",
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
              { label: "Gym", value: "Not yet", tone: "text-sky-200", icon: Dumbbell },
              { label: "Water", value: "24 oz", tone: "text-cyan-200", icon: Droplets },
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
              <li className="flex items-start gap-3"><Brain size={16} className="mt-0.5 text-cyan-300" />Log a protein-heavy meal before dinner to stay on pace.</li>
              <li className="flex items-start gap-3"><Dumbbell size={16} className="mt-0.5 text-sky-300" />Do a short gym session or mobility block today.</li>
              <li className="flex items-start gap-3"><ListTodo size={16} className="mt-0.5 text-amber-300" />Capture your Discount Tire wheels task so JARVIS can remind you.</li>
            </ul>
          </Surface>

          <Surface className="p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">System streaks</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-slate-400">Nutrition</p>
                <p className="mt-2 text-2xl font-semibold text-white">9 days</p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-slate-400">Gym</p>
                <p className="mt-2 text-2xl font-semibold text-white">3 days</p>
              </div>
            </div>
          </Surface>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { label: "Nutrition", href: "/nutrition", copy: `${todayEntries.length} meals logged today`, icon: Sparkles },
          { label: "Gym", href: "/gym", copy: "Workout calendar and recovery", icon: Dumbbell },
          { label: "Calendar", href: "/calendar", copy: "Unified OS timeline view", icon: CalendarDays },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href}>
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
