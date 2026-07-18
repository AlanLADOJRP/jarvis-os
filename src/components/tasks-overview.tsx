"use client";

import { SectionHeading } from "@/components/ui/section-heading";
import { TodoListPanel } from "@/components/todo-list-panel";
import { useDashboardData } from "@/lib/dashboard-client";

export function TasksOverview() {
  const { data } = useDashboardData();
  const openTasks = (data?.tasks ?? []).filter((task) => task.status !== "DONE" && task.status !== "CANCELED");

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Execution"
        title="To-Do"
        description={openTasks.length === 0 ? "No open tasks yet. Add one here or tell JARVIS to create it." : `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"}.`}
      />
      <TodoListPanel />
    </div>
  );
}
