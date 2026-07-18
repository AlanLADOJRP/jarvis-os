"use client";

import Link from "next/link";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { TaskPriority, TaskStatus } from "@prisma/client";
import { useState } from "react";
import { useDashboardData } from "@/lib/dashboard-client";

type TodoListPanelProps = {
  compact?: boolean;
};

export function TodoListPanel({ compact = false }: TodoListPanelProps) {
  const { data, loading, refresh } = useDashboardData();
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const tasks = (data?.tasks ?? []).filter((task) => task.status !== TaskStatus.CANCELED);
  const openTasks = tasks.filter((task) => task.status !== TaskStatus.DONE);

  async function addTask() {
    const title = input.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority: TaskPriority.MEDIUM }),
      });
      setInput("");
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(id: string, done: boolean) {
    setSaving(true);
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: done ? TaskStatus.TODO : TaskStatus.DONE }),
      });
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(id: string) {
    setSaving(true);
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">To-Do list</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{compact ? "Right now" : "Tasks"}</h3>
        </div>
        {compact ? (
          <Link href="/tasks" prefetch={false} className="text-sm text-cyan-200">
            Open tab
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addTask();
            }
          }}
          placeholder="Add a task"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void addTask()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500 text-black disabled:opacity-60"
          aria-label="Add task"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className={`mt-4 space-y-2 ${compact ? "max-h-64" : "max-h-[65vh]"} overflow-y-auto`}>
        {loading ? <p className="text-sm text-slate-300">Loading tasks...</p> : null}
        {!loading && openTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-300">
            No open tasks yet. Add one here or tell JARVIS to create it.
          </p>
        ) : null}

        {openTasks.slice(0, compact ? 5 : openTasks.length).map((task) => (
          <div key={task.id} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-100">{task.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{task.priority.toLowerCase()}</p>
                {task.description ? <p className="mt-2 text-sm text-slate-300">{task.description}</p> : null}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleDone(task.id, false)}
                  className="rounded-md border border-emerald-500/50 p-2 text-emerald-200 disabled:opacity-60"
                  aria-label={`Complete ${task.title}`}
                >
                  <CheckCircle2 size={14} />
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeTask(task.id)}
                  className="rounded-md border border-red-500/50 p-2 text-red-200 disabled:opacity-60"
                  aria-label={`Delete ${task.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
