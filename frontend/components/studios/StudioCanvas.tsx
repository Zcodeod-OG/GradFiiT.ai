"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ReactNode } from "react";

import { crossDissolve } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { LoadingDots } from "@/components/ui/loading-placeholder";

type StudioCanvasProps = {
  state: "idle" | "loading" | "result" | "error";
  emptyHint?: ReactNode;
  loadingHint?: ReactNode;
  errorMessage?: string | null;
  children?: ReactNode;
  className?: string;
};

/**
 * The big square preview area each studio drops its result image into.
 * Handles four states: idle (placeholder), loading (spinner), result
 * (the children), and error (red-tinted message). All state changes
 * cross-dissolve via Framer Motion.
 */
export function StudioCanvas({
  state,
  emptyHint,
  loadingHint,
  errorMessage,
  children,
  className,
}: StudioCanvasProps) {
  return (
    <div
      className={cn(
        "relative aspect-[4/5] w-full max-w-[640px] overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-muted/30 via-background to-muted/30 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.4)]",
        className
      )}
    >
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.div
            key="idle"
            variants={crossDissolve}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 flex items-center justify-center text-center px-6 text-sm text-muted-foreground"
          >
            {emptyHint ?? "Configure the panel on the right to begin."}
          </motion.div>
        )}

        {state === "loading" && (
          <motion.div
            key="loading"
            variants={crossDissolve}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground overflow-hidden"
          >
            {/* Shimmer wash so the canvas feels alive while the model
                spins up; LoadingDots sit on top of it. */}
            <div
              aria-hidden
              className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10"
            />
            <LoadingDots size="lg" className="relative text-foreground/70" />
            <span className="relative">{loadingHint ?? "Generating on the FLUX endpoint…"}</span>
          </motion.div>
        )}

        {state === "result" && (
          <motion.div
            key="result"
            variants={crossDissolve}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0"
          >
            {children}
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            variants={crossDissolve}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 flex items-center justify-center text-center px-6 text-sm text-destructive"
          >
            {errorMessage || "Something went wrong. Try again."}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
