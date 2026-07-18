import type { ReactNode } from "react";
import clsx from "clsx";

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-[28px] border border-white/10 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
