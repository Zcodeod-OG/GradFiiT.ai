"use client"

import { useEffect } from "react"

// Pings the backend /health once when the app mounts so a sleeping Render
// free-tier instance starts waking up before the user triggers an API
// request. Fire-and-forget — errors are swallowed since this is opportunistic.
export function BackendWarmup() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    fetch(`${base}/health`, { cache: "no-store" }).catch(() => {})
  }, [])

  return null
}
