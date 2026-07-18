"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  Brain,
  CalendarDays,
  CircleGauge,
  Dumbbell,
  Home,
  Settings,
  Sparkles,
  Waves,
  Workflow,
  Footprints,
} from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { GlobalCommand } from "@/components/shell/global-command";

const navigation = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/nutrition", label: "Nutrition", icon: Sparkles },
  { href: "/gym", label: "Gym", icon: Dumbbell },
  { href: "/activity", label: "Activity", icon: Footprints },
  { href: "/water", label: "Water", icon: Waves },
  { href: "/tasks", label: "To-Do", icon: Workflow },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.12),_transparent_28%),linear-gradient(180deg,#060914_0%,#070b12_35%,#05070b_100%)] text-slate-100">
      <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1900px] flex-col lg:grid lg:grid-cols-[280px_1fr]">
        <aside className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/65 px-4 py-4 backdrop-blur-2xl lg:h-screen lg:border-b-0 lg:border-r lg:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-white/10 shadow-[0_0_36px_rgba(56,189,248,0.25)]">
              <Brain className="text-cyan-200" size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">JARVIS OS</p>
              <p className="text-sm text-slate-200">Personal operating system</p>
            </div>
          </div>

          <nav className="mt-6 flex gap-2 overflow-x-auto pb-2 lg:mt-8 lg:flex-col lg:overflow-visible lg:pb-0">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={clsx(
                    "group flex min-w-max items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-300 lg:min-w-0",
                    active
                      ? "border-cyan-400/35 bg-white/10 text-white shadow-[0_0_30px_rgba(56,189,248,0.12)]"
                      : "border-transparent bg-white/[0.03] text-slate-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <Icon size={16} className={active ? "text-cyan-200" : "text-slate-400"} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-4 lg:block">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-400">
              <span>System Modules</span>
              <CircleGauge size={14} />
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <span>Nutrition</span>
                <span className="text-emerald-300">Live</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Gym</span>
                <span className="text-sky-300">Live</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Water, Tasks, Calendar</span>
                <span className="text-amber-300">Coming soon</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:py-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="rounded-[32px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-3xl sm:p-6 lg:p-8"
          >
            {children}
          </motion.div>
        </main>
      </div>
      <GlobalCommand />
    </div>
  );
}
