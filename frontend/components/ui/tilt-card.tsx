"use client"

import { useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"

interface TiltCardProps {
  children: ReactNode
  className?: string
  intensity?: number
  glare?: boolean
}

export function TiltCard({
  children,
  className = "",
  intensity = 15,
  glare = true,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const x = e.clientX - centerX
    const y = e.clientY - centerY

    setRotateX((y / (rect.height / 2)) * -intensity)
    setRotateY((x / (rect.width / 2)) * intensity)

    if (glare) {
      setGlarePos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      })
    }
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
    setGlarePos({ x: 50, y: 50 })
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: "1000px" }}
      className={className}
    >
      <motion.div
        animate={{ rotateX, rotateY }}
        transition={{ type: "spring", stiffness: 300, damping: 20, mass: 0.5 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative"
      >
        {children}
        {glare && (
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none z-10"
            animate={{ opacity: rotateX !== 0 || rotateY !== 0 ? 0.12 : 0 }}
            transition={{ duration: 0.2 }}
            style={{
              background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, oklch(1 0 0 / 0.25), transparent 60%)`,
            }}
          />
        )}
      </motion.div>
    </div>
  )
}
