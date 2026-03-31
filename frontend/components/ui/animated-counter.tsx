"use client"

import { useEffect, useRef } from "react"
import { useInView, useMotionValue, useTransform, animate, motion } from "framer-motion"

interface AnimatedCounterProps {
  from?: number
  to: number
  duration?: number
  suffix?: string
  prefix?: string
  className?: string
}

export function AnimatedCounter({
  from = 0,
  to,
  duration = 2,
  suffix = "",
  prefix = "",
  className = "",
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })
  const count = useMotionValue(from)
  const rounded = useTransform(count, (v) => Math.round(v))

  useEffect(() => {
    if (isInView) {
      const controls = animate(count, to, {
        duration,
        ease: "easeOut",
      })
      return controls.stop
    }
  }, [isInView, count, to, duration])

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => {
      if (ref.current) {
        ref.current.textContent = `${prefix}${v.toLocaleString()}${suffix}`
      }
    })
    return unsubscribe
  }, [rounded, prefix, suffix])

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
    >
      {prefix}{from}{suffix}
    </motion.span>
  )
}
