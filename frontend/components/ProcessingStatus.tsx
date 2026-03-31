"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  CheckCircle2,
  Upload,
  Scan,
  Sparkles,
  Wand2,
  X,
  Loader2,
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ProcessingStep = {
  id: number
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  completed: boolean
  inProgress: boolean
}

type ProcessingStatusProps = {
  progress: number // 0-100
  currentStep: number // 0-4
  estimatedTimeRemaining: number // seconds
  onCancel?: () => void
  steps?: ProcessingStep[]
  isCompleted?: boolean
}

const defaultSteps: ProcessingStep[] = [
  {
    id: 0,
    name: "Uploading images",
    description: "Preparing your photos...",
    icon: Upload,
    completed: false,
    inProgress: false,
  },
  {
    id: 1,
    name: "Analyzing garment",
    description: "Detecting garment structure...",
    icon: Scan,
    completed: false,
    inProgress: false,
  },
  {
    id: 2,
    name: "Generating try-on",
    description: "Creating virtual fit...",
    icon: Sparkles,
    completed: false,
    inProgress: false,
  },
  {
    id: 3,
    name: "Enhancing quality",
    description: "Adding finishing touches...",
    icon: Wand2,
    completed: false,
    inProgress: false,
  },
  {
    id: 4,
    name: "Complete!",
    description: "Your try-on is ready",
    icon: CheckCircle2,
    completed: false,
    inProgress: false,
  },
]

export function ProcessingStatus({
  progress,
  currentStep,
  estimatedTimeRemaining,
  onCancel,
  steps = defaultSteps,
  isCompleted = false,
}: ProcessingStatusProps) {
  const [timeRemaining, setTimeRemaining] = useState(estimatedTimeRemaining)
  const [displayProgress, setDisplayProgress] = useState(0)

  // Animate progress bar
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayProgress(progress)
    }, 100)
    return () => clearTimeout(timer)
  }, [progress])

  // Countdown timer
  useEffect(() => {
    if (isCompleted || timeRemaining <= 0) {
      setTimeRemaining(0)
      return
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(interval)
  }, [isCompleted, estimatedTimeRemaining])

  // Sync time remaining with prop updates
  useEffect(() => {
    setTimeRemaining(estimatedTimeRemaining)
  }, [estimatedTimeRemaining])

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return "Almost done..."
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}m ${secs}s remaining`
    }
    return `${secs}s remaining`
  }

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < currentStep) return "completed"
    if (stepIndex === currentStep) return isCompleted ? "completed" : "inProgress"
    return "pending"
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 p-6 bg-card border rounded-lg shadow-sm"
    >
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Processing</span>
          <span className="text-muted-foreground">
            {Math.round(displayProgress)}%
          </span>
        </div>
        <Progress value={displayProgress} className="h-2" />
      </div>

      {/* Steps List */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const status = getStepStatus(index)
          const Icon = step.icon
          const isActive = status === "inProgress"
          const isCompleted = status === "completed"

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "flex items-start gap-4 p-3 rounded-lg transition-colors",
                isActive && "bg-primary/5 border border-primary/20",
                isCompleted && "bg-muted/50",
                !isActive && !isCompleted && "opacity-60"
              )}
            >
              {/* Icon */}
              <div className="relative flex-shrink-0 mt-0.5">
                <AnimatePresence mode="wait">
                  {isCompleted ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      <CheckCircle2 className="size-5 text-primary" />
                    </motion.div>
                  ) : isActive ? (
                    <motion.div
                      key="loader"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    >
                      <Loader2 className="size-5 text-primary" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="icon"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Icon className="size-5 text-muted-foreground" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <motion.p
                    className={cn(
                      "text-sm font-medium",
                      isActive && "text-primary",
                      isCompleted && "text-foreground",
                      !isActive && !isCompleted && "text-muted-foreground"
                    )}
                    animate={{
                      scale: isActive ? [1, 1.02, 1] : 1,
                    }}
                    transition={{
                      duration: 2,
                      repeat: isActive ? Infinity : 0,
                      ease: "easeInOut",
                    }}
                  >
                    {step.name}
                    {isActive && (
                      <motion.span
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        {" "}
                       ...
                      </motion.span>
                    )}
                  </motion.p>
                </div>
                <motion.p
                  className={cn(
                    "text-xs",
                    isActive && "text-primary/80",
                    isCompleted && "text-muted-foreground",
                    !isActive && !isCompleted && "text-muted-foreground/70"
                  )}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {step.description}
                </motion.p>
              </div>

              {/* Active Indicator */}
              {isActive && (
                <motion.div
                  className="flex-shrink-0"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Time Remaining & Cancel Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between pt-4 border-t"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={!isCompleted && timeRemaining > 0 ? { rotate: 360 } : {}}
            transition={{
              duration: 2,
              repeat: !isCompleted && timeRemaining > 0 ? Infinity : 0,
              ease: "linear",
            }}
          >
            <Loader2
              className={cn(
                "size-4",
                isCompleted ? "text-primary" : "text-muted-foreground"
              )}
            />
          </motion.div>
          <span className="text-sm text-muted-foreground">
            {isCompleted
              ? "Processing complete!"
              : formatTime(timeRemaining)}
          </span>
        </div>

        {onCancel && !isCompleted && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-4 mr-2" />
            Cancel
          </Button>
        )}
      </motion.div>
    </motion.div>
  )
}

