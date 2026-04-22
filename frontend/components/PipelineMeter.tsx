"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useMemo } from "react"

import { cn } from "@/lib/utils"
import type { TryOnLiveStatus } from "@/components/hooks/useTryOnLiveStatus"

type Stage = {
  id: string
  label: string
  // The set of backend status strings (or postprocess sub-stages stamped
  // on `pipeline_metadata.postprocess.current_stage`) that map onto this
  // stage. The stage is "current" when one of these matches the live
  // status, "complete" once the pipeline has progressed past it.
  matches: ReadonlyArray<string>
  postprocessStage?: string
  pct: number
}

const STAGES_2D: Stage[] = [
  { id: "queue", label: "Warming up", matches: ["pending", "queued"], pct: 10 },
  {
    id: "generate",
    label: "Generating try-on",
    matches: ["stage1_processing", "garment_extracting", "garment_extracted"],
    pct: 50,
  },
  {
    id: "identity",
    label: "Checking identity match",
    matches: ["postprocessing"],
    postprocessStage: "postprocess_identity",
    pct: 75,
  },
  {
    id: "face",
    label: "Enhancing face details",
    matches: ["postprocessing"],
    postprocessStage: "postprocess_face",
    pct: 85,
  },
  {
    id: "upscale",
    label: "Upscaling output",
    matches: ["postprocessing"],
    postprocessStage: "postprocess_upscale",
    pct: 95,
  },
  { id: "done", label: "Ready", matches: ["completed"], pct: 100 },
]

const STAGES_3D: Stage[] = [
  { id: "queue", label: "Warming up", matches: ["pending", "queued"], pct: 10 },
  {
    id: "avatar",
    label: "Building 3D mannequin",
    matches: ["avatar_3d_generating"],
    pct: 35,
  },
  {
    id: "fit",
    label: "Fitting garment",
    matches: ["garment_fitting_3d"],
    pct: 65,
  },
  {
    id: "render",
    label: "Rendering 360°",
    matches: ["model_rendering_3d"],
    pct: 90,
  },
  { id: "done", label: "Ready", matches: ["completed"], pct: 100 },
]

type Props = {
  status: TryOnLiveStatus | null
  mode?: string | null
  className?: string
  compact?: boolean
}

export function PipelineMeter({ status, mode, className, compact }: Props) {
  const reduce = useReducedMotion()
  const stages = (mode || status?.tryon_mode) === "3d" ? STAGES_3D : STAGES_2D

  const { activeIndex, currentSubStage } = useMemo(() => {
    if (!status) return { activeIndex: 0, currentSubStage: null as string | null }
    const sub =
      ((status.pipeline_metadata as Record<string, unknown> | null)?.postprocess as
        | Record<string, unknown>
        | undefined)?.current_stage ?? null
    const idx = stages.findIndex((stage) => {
      if (!stage.matches.includes(status.status)) return false
      if (stage.postprocessStage && stage.postprocessStage !== sub) return false
      return true
    })
    if (idx === -1) {
      // fall back to whichever stage matches the bare status (no sub-stage)
      const fallback = stages.findIndex((stage) =>
        stage.matches.includes(status.status)
      )
      return {
        activeIndex: fallback === -1 ? 0 : fallback,
        currentSubStage: typeof sub === "string" ? sub : null,
      }
    }
    return { activeIndex: idx, currentSubStage: typeof sub === "string" ? sub : null }
  }, [status, stages])

  const totalPct = status?.progress ?? stages[activeIndex]?.pct ?? 0

  return (
    <div className={cn("space-y-3", className)}>
      {!compact ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {status?.current_stage || stages[activeIndex]?.label || "Preparing..."}
          </span>
          <span className="tabular-nums">{Math.round(totalPct)}%</span>
        </div>
      ) : null}

      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-sky-500 to-emerald-400"
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(100, totalPct))}%` }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 80, damping: 18 }
          }
        />
        {!reduce ? (
          <motion.div
            className="absolute inset-y-0 left-0 w-12 rounded-full bg-white/40 blur-sm"
            initial={{ x: -48 }}
            animate={{ x: `${Math.max(0, Math.min(100, totalPct))}%` }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />
        ) : null}
      </div>

      {compact ? null : (
        <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {stages.map((stage, idx) => {
            const isActive = idx === activeIndex
            const isComplete = idx < activeIndex || status?.status === "completed"
            return (
              <li
                key={stage.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                  isComplete
                    ? "border-emerald-200/70 bg-emerald-50/70 text-emerald-700"
                    : isActive
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/70 bg-white/60 text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "inline-block size-2 shrink-0 rounded-full",
                    isComplete
                      ? "bg-emerald-500"
                      : isActive
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                  )}
                />
                <span className="truncate">{stage.label}</span>
              </li>
            )
          })}
        </ol>
      )}

      {currentSubStage && !compact ? (
        <p className="text-[11px] text-muted-foreground">
          {status?.current_stage}
        </p>
      ) : null}
    </div>
  )
}
