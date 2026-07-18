"use client";

import { JarvisCommandPanel } from "@/components/jarvis-command-panel";

export function GlobalCommand() {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-6 sm:w-[420px]">
      <div className="pointer-events-auto">
        <JarvisCommandPanel collapsible className="w-full" />
      </div>
    </div>
  );
}
