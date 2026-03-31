"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { ProcessingStep } from "../ProcessingStatus"

type ProcessingStatusData = {
  progress: number
  currentStep: number
  estimatedTimeRemaining: number
  isCompleted: boolean
  steps?: ProcessingStep[]
}

type UseProcessingStatusOptions = {
  // WebSocket options
  websocketUrl?: string
  useWebSocket?: boolean
  
  // Polling options
  pollingUrl?: string
  pollingInterval?: number
  usePolling?: boolean
  
  // Initial state
  initialProgress?: number
  initialStep?: number
  initialTimeRemaining?: number
  
  // Callbacks
  onComplete?: () => void
  onError?: (error: Error) => void
  onCancel?: () => Promise<void> | void
}

export function useProcessingStatus({
  websocketUrl,
  useWebSocket = false,
  pollingUrl,
  pollingInterval = 1000,
  usePolling = false,
  initialProgress = 0,
  initialStep = 0,
  initialTimeRemaining = 60,
  onComplete,
  onError,
  onCancel,
}: UseProcessingStatusOptions = {}) {
  const [status, setStatus] = useState<ProcessingStatusData>({
    progress: initialProgress,
    currentStep: initialStep,
    estimatedTimeRemaining: initialTimeRemaining,
    isCompleted: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isCancelledRef = useRef(false)

  // WebSocket connection
  useEffect(() => {
    if (!useWebSocket || !websocketUrl || isCancelledRef.current) return

    const ws = new WebSocket(websocketUrl)

    ws.onopen = () => {
      console.log("WebSocket connected")
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === "progress") {
          setStatus((prev) => ({
            ...prev,
            progress: data.progress,
            currentStep: data.currentStep || prev.currentStep,
            estimatedTimeRemaining: data.estimatedTimeRemaining || prev.estimatedTimeRemaining,
          }))
        } else if (data.type === "complete") {
          setStatus((prev) => ({
            ...prev,
            progress: 100,
            isCompleted: true,
            estimatedTimeRemaining: 0,
          }))
          onComplete?.()
        } else if (data.type === "error") {
          const error = new Error(data.message || "Processing error")
          onError?.(error)
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error)
        onError?.(error as Error)
      }
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
      onError?.(new Error("WebSocket connection error"))
    }

    ws.onclose = () => {
      console.log("WebSocket disconnected")
    }

    wsRef.current = ws

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [useWebSocket, websocketUrl, onComplete, onError])

  // Polling
  const pollStatus = useCallback(async () => {
    if (!pollingUrl || isCancelledRef.current) return

    try {
      const response = await fetch(pollingUrl)
      if (!response.ok) throw new Error("Failed to fetch status")

      const data = await response.json()
      
      setStatus((prev) => ({
        ...prev,
        progress: data.progress ?? prev.progress,
        currentStep: data.currentStep ?? prev.currentStep,
        estimatedTimeRemaining: data.estimatedTimeRemaining ?? prev.estimatedTimeRemaining,
        isCompleted: data.isCompleted ?? prev.isCompleted,
      }))

      if (data.isCompleted) {
        onComplete?.()
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      }
    } catch (error) {
      console.error("Polling error:", error)
      onError?.(error as Error)
    }
  }, [pollingUrl, onComplete, onError])

  useEffect(() => {
    if (!usePolling || !pollingUrl || isCancelledRef.current) return

    // Initial poll
    pollStatus()

    // Set up interval
    pollingIntervalRef.current = setInterval(pollStatus, pollingInterval)

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [usePolling, pollingUrl, pollingInterval, pollStatus])

  // Manual update function
  const updateStatus = useCallback((updates: Partial<ProcessingStatusData>) => {
    setStatus((prev) => ({
      ...prev,
      ...updates,
    }))
  }, [])

  // Cancel function
  const cancel = useCallback(async () => {
    isCancelledRef.current = true
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Clear polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    // Call cancel callback
    await onCancel?.()

    setStatus((prev) => ({
      ...prev,
      isCompleted: false,
      progress: 0,
    }))
  }, [onCancel])

  // Reset function
  const reset = useCallback(() => {
    isCancelledRef.current = false
    setStatus({
      progress: initialProgress,
      currentStep: initialStep,
      estimatedTimeRemaining: initialTimeRemaining,
      isCompleted: false,
    })
  }, [initialProgress, initialStep, initialTimeRemaining])

  return {
    ...status,
    updateStatus,
    cancel,
    reset,
  }
}

