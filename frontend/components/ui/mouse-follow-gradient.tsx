"use client"

import { useEffect, useRef } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"

interface MouseFollowGradientProps {
  className?: string
  size?: number
  intensity?: number
}

export function MouseFollowGradient({
  className = "",
  size = 600,
  intensity = 0.2,
}: MouseFollowGradientProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 })
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      mouseX.set(e.clientX - rect.left)
      mouseY.set(e.clientY - rect.top)
    }

    const container = containerRef.current?.parentElement
    if (container) {
      container.addEventListener("mousemove", handleMouseMove)
      return () => container.removeEventListener("mousemove", handleMouseMove)
    }
  }, [mouseX, mouseY])

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
    >
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          x: springX,
          y: springY,
          translateX: "-50%",
          translateY: "-50%",
          background: `radial-gradient(circle, oklch(0.65 0.25 275 / ${intensity}) 0%, oklch(0.55 0.22 245 / ${intensity * 0.5}) 40%, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />
    </div>
  )
}
