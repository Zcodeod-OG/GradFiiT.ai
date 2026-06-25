"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

import { PromptPanel } from "./PromptPanel";

type ResponsivePromptPanelProps = {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * On desktop, renders a standard PromptPanel in the grid sidebar.
 * On mobile, collapses controls into a bottom sheet above the tab bar.
 */
export function ResponsivePromptPanel({
  title = "Controls",
  children,
  footer,
  className,
}: ResponsivePromptPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="lg:hidden flex w-full min-h-[48px] items-center justify-between rounded-2xl border border-border/50 bg-background/90 px-4 py-3 text-sm font-medium shadow-sm"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          className="lg:hidden fixed inset-x-0 z-40 max-h-[min(72vh,640px)] overflow-y-auto border-t border-border/60 bg-background/98 px-4 py-4 shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          style={{
            bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <PromptPanel title={title} footer={footer} className={className}>
            {children}
          </PromptPanel>
        </div>
      ) : null}

      <PromptPanel
        title={title}
        footer={footer}
        className={cn("hidden lg:flex", className)}
      >
        {children}
      </PromptPanel>
    </>
  );
}
