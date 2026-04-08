"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"

interface ParticleFieldProps {
  count?: number
  className?: string
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export function ParticleField({ count = 40, className = "" }: ParticleFieldProps) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${pseudoRandom(i + 1) * 100}%`,
      top: `${pseudoRandom(i + 101) * 100}%`,
      size: 2 + pseudoRandom(i + 201) * 4,
      duration: 3 + pseudoRandom(i + 301) * 5,
      delay: pseudoRandom(i + 401) * 5,
      color: i % 3 === 0 ? "bg-primary/20" : i % 3 === 1 ? "bg-accent/20" : "bg-primary/10",
      drift: -20 + pseudoRandom(i + 501) * 40,
    }))
  }, [count])

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute rounded-full ${p.color}`}
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, p.drift, 0],
            opacity: [0, 0.8, 0],
            scale: [0.5, 1, 0.5],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}
