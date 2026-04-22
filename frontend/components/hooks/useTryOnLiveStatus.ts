"use client"

import { useEffect, useRef, useState } from "react"

import { tryonApi } from "@/lib/api"

export type TryOnLiveStatus = {
  tryon_id: number
  status: string
  tryon_mode?: string
  progress: number
  current_stage: string
  extracted_garment_url?: string | null
  stage1_result_url?: string | null
  result_image_url?: string | null
  result_model_url?: string | null
  result_turntable_url?: string | null
  quality_gate_score?: number | null
  quality_gate_passed?: boolean | null
  rating_score?: number | null
  error_message?: string | null
  pipeline_metadata?: Record<string, unknown> | null
  lifecycle_status?: string | null
  worker_task_id?: string | null
  queue_wait_ms?: number | null
  execution_ms?: number | null
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "dead_letter",
  "cancelled",
])

/**
 * Polls /api/tryon/status/:id with smart backoff.
 *
 * - Aggressively (every 1.5s) while the pipeline is in postprocess, where
 *   sub-stages tick over in seconds. The backend returns granular labels
 *   from `POSTPROCESS_STAGE_LABELS` and we want the UI to follow.
 * - Moderate (every 3s) while the provider is generating.
 * - Slow (every 8s) while queued or stage1_completed.
 *
 * Stops automatically once the pipeline reaches a terminal status.
 */
export function useTryOnLiveStatus(tryonId: number | null) {
  const [status, setStatus] = useState<TryOnLiveStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    if (!tryonId) {
      setStatus(null)
      setError(null)
      return () => undefined
    }

    stoppedRef.current = false
    setIsPolling(true)

    const tick = async () => {
      if (stoppedRef.current) return
      try {
        const response = await tryonApi.getStatus(tryonId)
        const data = response.data?.data as TryOnLiveStatus | undefined
        if (!data) throw new Error("Empty status payload")
        setStatus(data)
        setError(null)

        if (TERMINAL_STATUSES.has(data.status)) {
          setIsPolling(false)
          return
        }

        const nextDelay = pickDelayMs(data.status)
        timerRef.current = setTimeout(tick, nextDelay)
      } catch (err) {
        setError((err as Error).message || "Lost connection to status feed")
        timerRef.current = setTimeout(tick, 5000)
      }
    }

    void tick()

    return () => {
      stoppedRef.current = true
      setIsPolling(false)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [tryonId])

  return { status, error, isPolling }
}

function pickDelayMs(status: string): number {
  switch (status) {
    case "postprocessing":
    case "stage2_processing":
    case "rating_computing":
      return 1500
    case "stage1_processing":
    case "garment_extracting":
    case "quality_checking":
    case "avatar_3d_generating":
    case "garment_fitting_3d":
    case "model_rendering_3d":
      return 3000
    case "queued":
    case "pending":
    case "stage1_completed":
    default:
      return 6000
  }
}
