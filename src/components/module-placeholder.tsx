import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Surface } from "@/components/ui/surface";

export function ModulePlaceholder({
  title,
  description,
  primaryHref,
  primaryLabel,
}: {
  title: string;
  description: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return (
    <div className="space-y-6">
      <Surface className="p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Coming soon</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">{description}</p>
        {primaryHref && primaryLabel ? (
          <Link
            href={primaryHref}
            prefetch={false}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/15"
          >
            {primaryLabel}
            <ArrowRight size={16} />
          </Link>
        ) : null}
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="min-h-48 p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">First action</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>No module data yet.</p>
            <p>Use Nutrition for meal logging.</p>
            <p>Use Gym to mark went or missed.</p>
          </div>
        </Surface>
        <Surface className="min-h-48 p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Architecture</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Shell and navigation are active.</p>
            <p>Prisma models are already in place.</p>
            <p>API endpoints will be enabled per module.</p>
          </div>
        </Surface>
      </div>
    </div>
  );
}
