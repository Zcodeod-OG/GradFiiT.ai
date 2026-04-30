"use client";

import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PromptPanelProps = {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Right-rail panel that hosts every studio's input controls. Keeps
 * spacing and section dividers consistent across Try-On, Design,
 * Stylist, and Brand DNA.
 */
export function PromptPanel({ title, children, footer, className }: PromptPanelProps) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-5 rounded-3xl border border-border/40 bg-background/70 backdrop-blur-md p-6 lg:p-7 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)] w-full",
        className
      )}
    >
      {title ? (
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight">{title}</h2>
        </div>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
      {footer ? (
        <div className="mt-2 flex flex-col gap-3 border-t border-border/40 pt-4">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
