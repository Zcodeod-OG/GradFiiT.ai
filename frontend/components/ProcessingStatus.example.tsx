"use client"

/**
 * Example usage of ProcessingStatus component
 * 
 * This file demonstrates how to integrate the ProcessingStatus component
 * with WebSocket or polling for real-time updates.
 */

import { useState } from "react"
import { ProcessingStatus } from "./ProcessingStatus"
import { useProcessingStatus } from "./hooks/useProcessingStatus"

// Example 1: Using with WebSocket
export function ProcessingStatusWithWebSocket() {
  const [jobId, setJobId] = useState<string | null>(null)

  const { progress, currentStep, estimatedTimeRemaining, isCompleted, cancel } =
    useProcessingStatus({
      useWebSocket: true,
      websocketUrl: jobId ? `ws://api.example.com/processing/${jobId}` : undefined,
      onComplete: () => {
        console.log("Processing complete!")
      },
      onError: (error) => {
        console.error("Processing error:", error)
      },
      onCancel: async () => {
        if (jobId) {
          await fetch(`/api/processing/${jobId}/cancel`, { method: "POST" })
        }
      },
    })

  // Start processing
  const handleStart = async () => {
    const response = await fetch("/api/processing/start", { method: "POST" })
    const { jobId: newJobId } = await response.json()
    setJobId(newJobId)
  }

  const steps = [
    {
      id: 0,
      name: "Uploading images",
      description: "Preparing your photos...",
      icon: () => null,
      completed: currentStep > 0,
      inProgress: currentStep === 0,
    },
    // ... more steps
  ]

  return (
    <div>
      {!jobId && <button onClick={handleStart}>Start Processing</button>}
      {jobId && (
        <ProcessingStatus
          progress={progress}
          currentStep={currentStep}
          estimatedTimeRemaining={estimatedTimeRemaining}
          isCompleted={isCompleted}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

// Example 2: Using with Polling
export function ProcessingStatusWithPolling() {
  const [jobId, setJobId] = useState<string | null>(null)

  const { progress, currentStep, estimatedTimeRemaining, isCompleted, cancel } =
    useProcessingStatus({
      usePolling: true,
      pollingUrl: jobId ? `/api/processing/${jobId}/status` : undefined,
      pollingInterval: 1000, // Poll every second
      onComplete: () => {
        console.log("Processing complete!")
      },
      onError: (error) => {
        console.error("Processing error:", error)
      },
      onCancel: async () => {
        if (jobId) {
          await fetch(`/api/processing/${jobId}/cancel`, { method: "POST" })
        }
      },
    })

  // Start processing
  const handleStart = async () => {
    const response = await fetch("/api/processing/start", { method: "POST" })
    const { jobId: newJobId } = await response.json()
    setJobId(newJobId)
  }

  return (
    <div>
      {!jobId && <button onClick={handleStart}>Start Processing</button>}
      {jobId && (
        <ProcessingStatus
          progress={progress}
          currentStep={currentStep}
          estimatedTimeRemaining={estimatedTimeRemaining}
          isCompleted={isCompleted}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

// Example 3: Manual updates (no real-time)
export function ProcessingStatusManual() {
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(60)
  const [isCompleted, setIsCompleted] = useState(false)

  // Simulate processing
  const handleStart = () => {
    let currentProgress = 0
    let step = 0
    
    const interval = setInterval(() => {
      currentProgress += 2
      setProgress(currentProgress)

      // Update step based on progress
      if (currentProgress >= 20 && step === 0) {
        step = 1
        setCurrentStep(step)
      } else if (currentProgress >= 50 && step === 1) {
        step = 2
        setCurrentStep(step)
      } else if (currentProgress >= 80 && step === 2) {
        step = 3
        setCurrentStep(step)
      } else if (currentProgress >= 100 && step === 3) {
        step = 4
        setCurrentStep(step)
        setIsCompleted(true)
        clearInterval(interval)
      }

      setTimeRemaining((prev) => Math.max(0, prev - 1))
    }, 200)
  }

  return (
    <div>
      <button onClick={handleStart}>Start Processing</button>
      <ProcessingStatus
        progress={progress}
        currentStep={currentStep}
        estimatedTimeRemaining={timeRemaining}
        isCompleted={isCompleted}
        onCancel={() => {
          setIsCompleted(true)
        }}
      />
    </div>
  )
}

