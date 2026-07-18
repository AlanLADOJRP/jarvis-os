import { ModulePage } from "@/components/module-page";

export default function SettingsPage() {
  return (
    <ModulePage
      title="Settings"
      description="Goal, layout, and future integration settings will be centralized here as JARVIS OS expands."
      primaryHref="/nutrition"
      primaryLabel="Open Nutrition"
    />
  );
}
