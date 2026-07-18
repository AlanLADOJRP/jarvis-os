import { ModulePage } from "@/components/module-page";

export default function TasksPage() {
  return (
    <ModulePage
      title="Tasks"
      description="This module will behave like an executive assistant with priorities, reminders, and scheduling instead of a flat todo list."
      primaryHref="/calendar"
      primaryLabel="Open Calendar"
    />
  );
}
