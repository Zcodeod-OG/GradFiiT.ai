"use client"

import { useRef, useState, useEffect } from "react"
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Sparkles, ArrowRight, ChevronDown, Upload, Shirt, Wand2 } from "lucide-react"
import { ParticleField } from "@/components/ui/particle-field"
import { MouseFollowGradient } from "@/components/ui/mouse-follow-gradient"
import { AnimatedCounter } from "@/components/ui/animated-counter"
import Link from "next/link"

const ROTATING_WORDS = ["Virtually", "Instantly", "Perfectly", "Effortlessly"]

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  })

  const contentY = useTransform(scrollYProgress, [0, 1], [0, -120])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20"
    >
      {/* Layer 1: Animated gradient mesh background */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute inset-0 opacity-40"
          animate={{
            background: [
              "radial-gradient(circle 800px at 20% 40%, oklch(0.65 0.25 275 / 0.3) 0%, transparent 70%), radial-gradient(circle 600px at 80% 60%, oklch(0.55 0.22 245 / 0.2) 0%, transparent 70%)",
              "radial-gradient(circle 800px at 80% 30%, oklch(0.55 0.22 245 / 0.3) 0%, transparent 70%), radial-gradient(circle 600px at 20% 70%, oklch(0.65 0.25 275 / 0.2) 0%, transparent 70%)",
              "radial-gradient(circle 800px at 50% 80%, oklch(0.6 0.2 260 / 0.3) 0%, transparent 70%), radial-gradient(circle 600px at 50% 20%, oklch(0.65 0.25 275 / 0.2) 0%, transparent 70%)",
              "radial-gradient(circle 800px at 20% 40%, oklch(0.65 0.25 275 / 0.3) 0%, transparent 70%), radial-gradient(circle 600px at 80% 60%, oklch(0.55 0.22 245 / 0.2) 0%, transparent 70%)",
            ],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Layer 2: Particle field */}
      <ParticleField count={45} />

      {/* Layer 3: Mouse-follow gradient */}
      <MouseFollowGradient intensity={0.15} size={700} />

      {/* Layer 4: Content with parallax */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="container mx-auto px-4 relative z-10"
      >
        <div className="max-w-5xl mx-auto text-center space-y-8">
          {/* Badge with shimmer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="glass-effect shimmer px-5 py-2.5 rounded-full text-sm text-primary font-medium inline-flex items-center gap-2">
              <Sparkles className="size-4" />
              Powered by Advanced AI
            </span>
          </motion.div>

          {/* Headline with morphing word */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-balance leading-tight">
              Try Before You Buy —{" "}
              <span className="inline-block" style={{ perspective: "600px" }}>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={ROTATING_WORDS[wordIndex]}
                    className="text-gradient inline-block"
                    initial={{ rotateX: -80, opacity: 0, y: 20 }}
                    animate={{ rotateX: 0, opacity: 1, y: 0 }}
                    exit={{ rotateX: 80, opacity: 0, y: -20 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  >
                    {ROTATING_WORDS[wordIndex]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto text-balance"
          >
            AI-powered virtual try-on that lets you see how any clothing looks on
            you — in seconds, not hours.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/try">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 h-14 pulse-glow"
              >
                Try It Free
                <ArrowRight className="size-5 ml-2" />
              </Button>
            </Link>
            <Link href="#demo">
              <Button
                size="lg"
                variant="outline"
                className="glass-effect text-foreground border-glass-border hover:bg-white/5 text-lg px-8 h-14 bg-transparent"
              >
                See It In Action
              </Button>
            </Link>
          </motion.div>

          {/* 3D Hero Visual — CSS-based try-on mockup */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.9 }}
            className="pt-12"
            style={{ perspective: "1200px" }}
          >
            <motion.div
              className="glass-card rounded-2xl p-1.5 max-w-3xl mx-auto relative"
              initial={{ rotateX: 12 }}
              animate={{ rotateX: 4 }}
              whileHover={{ rotateX: 0, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              {/* Inner mockup */}
              <div className="aspect-video rounded-xl bg-gradient-to-br from-purple-900/30 via-background to-blue-900/30 relative overflow-hidden">
                {/* Subtle grid overlay */}
                <div
                  className="absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage:
                      "linear-gradient(oklch(1 0 0 / 0.3) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.3) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />

                {/* Person silhouette */}
                <div className="absolute left-[15%] top-[10%] w-[28%] h-[80%] flex items-center justify-center">
                  <div className="w-full h-full rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.08] flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/[0.08] border border-white/[0.1]" />
                    <div className="w-24 h-32 md:w-28 md:h-40 rounded-xl bg-white/[0.06] border border-white/[0.08]" />
                    <span className="text-xs text-muted-foreground/60 mt-1">Your Photo</span>
                  </div>
                </div>

                {/* Center arrow / processing indicator */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <motion.div
                    className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/20 flex items-center justify-center"
                    animate={{
                      scale: [1, 1.15, 1],
                      boxShadow: [
                        "0 0 20px oklch(0.65 0.25 275 / 0.2)",
                        "0 0 40px oklch(0.65 0.25 275 / 0.4)",
                        "0 0 20px oklch(0.65 0.25 275 / 0.2)",
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Wand2 className="size-6 md:size-7 text-primary" />
                  </motion.div>
                </div>

                {/* Result silhouette */}
                <div className="absolute right-[15%] top-[10%] w-[28%] h-[80%] flex items-center justify-center">
                  <div className="w-full h-full rounded-2xl bg-gradient-to-b from-primary/[0.08] to-accent/[0.04] border border-primary/[0.12] flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/[0.1] border border-primary/[0.15]" />
                    <div className="w-24 h-32 md:w-28 md:h-40 rounded-xl bg-gradient-to-b from-primary/[0.1] to-accent/[0.08] border border-primary/[0.12]" />
                    <span className="text-xs text-primary/60 mt-1">Try-On Result</span>
                  </div>
                </div>

                {/* Floating garment cards */}
                <motion.div
                  className="absolute top-[5%] right-[5%] w-16 h-20 md:w-20 md:h-24 glass-effect rounded-lg flex items-center justify-center"
                  animate={{ y: [0, -12, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Shirt className="size-6 md:size-8 text-primary/60" />
                </motion.div>
                <motion.div
                  className="absolute bottom-[8%] left-[5%] w-14 h-18 md:w-18 md:h-22 glass-effect rounded-lg flex items-center justify-center"
                  animate={{ y: [0, -16, 0] }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1.5,
                  }}
                >
                  <Upload className="size-5 md:size-6 text-accent/60" />
                </motion.div>
                <motion.div
                  className="absolute top-[40%] left-[3%] w-12 h-14 md:w-16 md:h-18 glass-effect rounded-lg flex items-center justify-center"
                  animate={{ y: [0, -10, 0] }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.8,
                  }}
                >
                  <Sparkles className="size-4 md:size-5 text-primary/50" />
                </motion.div>

                {/* Animated scanning line */}
                <motion.div
                  className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent"
                  animate={{ top: ["0%", "100%", "0%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </motion.div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="flex flex-wrap justify-center gap-8 md:gap-16 pt-8"
          >
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-foreground">
                <AnimatedCounter to={10000} suffix="+" duration={2.5} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">Try-Ons Generated</p>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-foreground">
                <AnimatedCounter to={98} suffix="%" duration={2} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">Accuracy Rate</p>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-foreground">
                &lt; <AnimatedCounter to={5} suffix="s" duration={1.5} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">Processing Time</p>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground/50">Scroll to explore</span>
          <ChevronDown className="size-5 text-muted-foreground/40" />
        </div>
      </motion.div>
    </section>
  )
}
