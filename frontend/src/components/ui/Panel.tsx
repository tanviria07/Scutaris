import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Rendered in the hairline header strip. */
  title?: string;
  /** Right-aligned slot in the header, e.g. a count or a phase badge. */
  action?: ReactNode;
  as?: "div" | "section" | "aside";
}

export function Panel({
  children,
  className,
  title,
  action,
  as: Tag = "div",
}: PanelProps) {
  return (
    <Tag className={cn("scut-panel pointer-events-auto flex flex-col", className)}>
      {title ? (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-hairline)] px-3 py-2">
          <h2 className="font-mono text-[10px] font-medium tracking-[0.18em] text-teal uppercase">
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}
