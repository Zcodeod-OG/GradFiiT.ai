"use client"

import { cn } from "@/lib/utils"

/**
 * Modern loading placeholders (replaces lonely spinning Loader2 icons).
 *
 * Five primitives, picked to match the surface area they cover:
 *
 *  - <Shimmer />              tiny building block: shimmering skeleton bar
 *  - <LoadingDots />          inline 3-dot pulse (button-friendly)
 *  - <PageLoader />           full-screen branded loader with shimmer card
 *  - <CanvasLoader />         full-card image placeholder (studio canvas)
 *  - <GalleryGridSkeleton />  responsive grid of skeleton cards (closet etc.)
 *
 * All keep a screen-reader-friendly `role="status"` + visually-hidden label
 * so we don't drop accessibility.
 */

/* ───────────────────────── Shimmer base block ─────────────────────────── */
//
// Background gradient sweeps left → right on top of `bg-muted/60`. The
// keyframes for `animate-shimmer` live in app/globals.css.
//
export function Shimmer({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent",
        "before:animate-shimmer dark:before:via-white/10",
        className
      )}
      {...props}
    />
  )
}

/* ───────────────────────── Bouncing dot indicator ─────────────────────── */
//
// Three dots that bounce in sequence. Replaces a small Loader2 in places
// where a skeleton would be visually overkill (status pills, etc.).
//
export function LoadingDots({
  className,
  size = "md",
  label = "Loading",
}: {
  className?: string
  size?: "sm" | "md" | "lg"
  label?: string
}) {
  const dot = {
    sm: "size-1",
    md: "size-1.5",
    lg: "size-2",
  }[size]
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center gap-1", className)}
    >
      <span
        className={cn(dot, "rounded-full bg-current animate-bounce")}
        style={{ animationDelay: "0ms", animationDuration: "900ms" }}
      />
      <span
        className={cn(dot, "rounded-full bg-current animate-bounce")}
        style={{ animationDelay: "150ms", animationDuration: "900ms" }}
      />
      <span
        className={cn(dot, "rounded-full bg-current animate-bounce")}
        style={{ animationDelay: "300ms", animationDuration: "900ms" }}
      />
    </span>
  )
}

/* ───────────────────────── Full-screen page loader ────────────────────── */
//
// Used while we're checking auth / completing OAuth callback. A soft
// gradient backdrop + a centered glass card with the brand wordmark and
// two shimmer bars under it. Reads as "the app is preparing your view"
// rather than the bland white-screen-with-spinner pattern.
//
export function PageLoader({
  title = "Loading",
  subtitle,
  className,
}: {
  title?: string
  subtitle?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "min-h-screen w-full flex items-center justify-center px-4",
        // soft brand-tinted radial wash
        "bg-[radial-gradient(circle_at_15%_10%,oklch(0.76_0.09_250/.22),transparent_55%),radial-gradient(circle_at_90%_20%,oklch(0.76_0.08_190/.18),transparent_58%)]",
        className
      )}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-white/75 backdrop-blur-xl shadow-[0_18px_48px_oklch(0.28_0.06_250/_0.14)] p-7 sm:p-8">
        {/* Brand row */}
        <div className="flex items-center gap-3">
          <div className="relative size-10 rounded-xl bg-gradient-to-br from-primary via-sky-500 to-emerald-400 shadow-inner">
            <div className="absolute inset-0 rounded-xl bg-white/20 animate-pulse" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {subtitle ? (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            ) : (
              <LoadingDots className="mt-1 text-muted-foreground/70" size="sm" />
            )}
          </div>
        </div>

        {/* Two shimmer bars to suggest "content arriving" */}
        <div className="mt-6 space-y-3">
          <Shimmer className="h-3 w-full rounded-full" />
          <Shimmer className="h-3 w-4/5 rounded-full" />
          <Shimmer className="h-3 w-2/3 rounded-full" />
        </div>
      </div>
      <span className="sr-only">{title}</span>
    </div>
  )
}

/* ───────────────────────── Studio-canvas loader ───────────────────────── */
//
// A full-card image-shaped placeholder. Used inside the studio canvas
// and the outfit combo render area, both of which are "we're producing
// an image right now" surfaces. The animated gradient frame doubles as
// a progress hint without committing to a specific %.
//
export function CanvasLoader({
  hint,
  className,
  aspect = "portrait",
}: {
  hint?: string
  className?: string
  aspect?: "portrait" | "square" | "wide"
}) {
  const aspectClass = {
    portrait: "aspect-[3/4]",
    square: "aspect-square",
    wide: "aspect-[16/9]",
  }[aspect]
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "relative w-full overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-muted via-muted/70 to-muted",
        "ring-1 ring-border/60",
        aspectClass,
        className
      )}
    >
      {/* Shimmer sweep across the whole card */}
      <div
        aria-hidden
        className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/55 to-transparent dark:via-white/10"
      />

      {/* Subtle floating gradient orbs to feel less flat */}
      <div
        aria-hidden
        className="absolute -top-10 -left-10 size-40 rounded-full bg-primary/15 blur-3xl animate-pulse"
        style={{ animationDuration: "2400ms" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-10 -right-10 size-44 rounded-full bg-emerald-400/15 blur-3xl animate-pulse"
        style={{ animationDuration: "2800ms", animationDelay: "600ms" }}
      />

      {/* Centered hint */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <LoadingDots size="lg" className="text-foreground/70" />
        {hint ? (
          <p className="text-xs sm:text-sm font-medium text-muted-foreground max-w-[28ch]">
            {hint}
          </p>
        ) : null}
      </div>

      <span className="sr-only">{hint || "Loading content"}</span>
    </div>
  )
}

/* ───────────────────────── Gallery grid skeleton ──────────────────────── */
//
// Renders N skeleton cards in a responsive grid. Used when closet /
// outfits / saved-looks are loading: the user immediately sees the
// layout filling in, which feels miles faster than a single spinner.
//
export function GalleryGridSkeleton({
  count = 6,
  compact = false,
  className,
}: {
  count?: number
  compact?: boolean
  className?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading items"
      className={cn(
        "grid gap-4",
        compact
          ? "grid-cols-2 sm:grid-cols-3"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border/60 bg-white/60 backdrop-blur-sm p-3 shadow-sm"
        >
          <Shimmer className="aspect-[3/4] w-full rounded-xl" />
          <div className="mt-3 space-y-2">
            <Shimmer className="h-3 w-3/4 rounded-full" />
            <Shimmer className="h-2.5 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading items</span>
    </div>
  )
}
