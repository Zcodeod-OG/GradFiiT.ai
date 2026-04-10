"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Sparkles, ArrowRight, ChevronDown, Shirt, Wand2 } from "lucide-react"
import { AnimatedCounter } from "@/components/ui/animated-counter"
import Link from "next/link"

const ROTATING_WORDS = ["Virtually", "Instantly", "Perfectly", "Effortlessly"]

export function HeroSection() {
  const [wordIndex, setWordIndex] = useState(0)
  const [split, setSplit] = useState(52)

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setSplit((prev) => (prev >= 58 ? 44 : 58))
    }, 2200)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="relative min-h-screen overflow-hidden pt-28 pb-20 md:pt-32 md:pb-24">
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute inset-0 opacity-60"
          animate={{
            background: [
              "radial-gradient(circle 680px at 10% 15%, oklch(0.74 0.1 250 / 0.28) 0%, transparent 60%), radial-gradient(circle 520px at 80% 20%, oklch(0.75 0.08 190 / 0.24) 0%, transparent 65%)",
              "radial-gradient(circle 620px at 18% 28%, oklch(0.74 0.1 250 / 0.24) 0%, transparent 60%), radial-gradient(circle 560px at 84% 26%, oklch(0.75 0.08 190 / 0.3) 0%, transparent 65%)",
              "radial-gradient(circle 720px at 8% 18%, oklch(0.74 0.1 250 / 0.26) 0%, transparent 60%), radial-gradient(circle 540px at 78% 18%, oklch(0.75 0.08 190 / 0.24) 0%, transparent 65%)",
            ],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="container-main relative z-10 grid lg:grid-cols-[1.02fr_0.98fr] gap-12 lg:gap-8 items-center">
        <div className="space-y-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/75 px-4 py-2 text-sm font-semibold text-foreground">
              <Sparkles className="size-4" />
              New OOTDiffusion-powered engine
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight text-balance">
              Wear It Online
              <br />
              <span className="text-gradient">{ROTATING_WORDS[wordIndex]}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg md:text-xl text-muted-foreground">
              A cleaner, faster virtual try-on flow with photoreal results in under a
              minute. Upload a photo, choose a garment, and preview instantly.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
          >
            <Link href="/try">
              <Button size="lg" className="h-12 px-7">
                Start Try-On
                <ArrowRight className="size-5" />
              </Button>
            </Link>
            <Link href="#demo">
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-7 bg-white/70"
              >
                Watch Demo
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="grid grid-cols-3 gap-4 max-w-xl"
          >
            <div>
              <div className="font-display text-3xl font-bold">
                <AnimatedCounter to={10000} suffix="+" duration={2.5} />
              </div>
              <p className="text-sm text-muted-foreground">Looks generated</p>
            </div>
            <div>
              <div className="font-display text-3xl font-bold">
                <AnimatedCounter to={98} suffix="%" duration={2.2} />
              </div>
              <p className="text-sm text-muted-foreground">Fit confidence</p>
            </div>
            <div>
              <div className="font-display text-3xl font-bold">
                &lt; <AnimatedCounter to={60} suffix="s" duration={1.8} />
              </div>
              <p className="text-sm text-muted-foreground">Typical runtime</p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.35 }}
          className="glass-card rounded-3xl p-4 md:p-6"
        >
          <div className="rounded-2xl overflow-hidden border border-border bg-white/80">
            <div className="px-4 py-3 border-b border-border bg-white/70 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Before / After Preview</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wand2 className="size-3.5" />
                Live compare
              </div>
            </div>

            <div className="relative h-[330px] md:h-[420px]">
              <div className="absolute inset-0 bg-[linear-gradient(160deg,#eceff6_0%,#f4f6fb_100%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,oklch(0.82_0.04_248/.35),transparent_62%)]" />

              <motion.div
                className="absolute inset-y-0 right-0 bg-[linear-gradient(160deg,#dce2f0_0%,#cfd7e8_100%)]"
                animate={{ width: `${split}%` }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />

              <motion.div
                className="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_0_1px_oklch(0.34_0.03_250/0.1)]"
                animate={{ left: `${100 - split}%` }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />

              <motion.div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-12 rounded-full border border-white bg-black/80 text-white flex items-center justify-center"
                animate={{ left: `${100 - split}%` }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              >
                <Shirt className="size-5" />
              </motion.div>

              <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-foreground">
                Before
              </div>
              <div className="absolute right-4 top-4 rounded-full bg-black/80 px-3 py-1 text-xs font-semibold text-white">
                After
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground/80">Scroll to explore</span>
          <ChevronDown className="size-5 text-muted-foreground/70" />
        </div>
      </motion.div>
    </section>
  )
}
