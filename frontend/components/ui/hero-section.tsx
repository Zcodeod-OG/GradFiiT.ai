"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Sparkles, ArrowRight, ChevronDown, Shirt, Wand2, Trophy, Flame, Gem } from "lucide-react"
import { AnimatedCounter } from "@/components/ui/animated-counter"
import Link from "next/link"

const ROTATING_WORDS = ["Instantly.", "In seconds.", "On any site.", "Before checkout."]

const HERO_COMPARE_BASE = "/landing/hero-compare-base.png"
const HERO_COMPARE_OUTFIT = "/landing/hero-compare-outfit.png"
const HERO_COMPARE_IMG_STYLE = { objectPosition: "center top" as const }
/** ~20% slower auto-compare: longer pause + slower handle travel. */
const HERO_COMPARE_INTERVAL_MS = Math.round(2200 * 1.25)
const HERO_COMPARE_TRANSITION_S = 1.5 * 1.25

export function HeroSection() {
  const [wordIndex, setWordIndex] = useState(0)
  const [split, setSplit] = useState(52)
  const [avatarPulse, setAvatarPulse] = useState(0)
  const reduceMotion = useReducedMotion()
  const sectionRef = useRef<HTMLElement | null>(null)

  // Parallax: tie a couple of layers to scroll progress through the hero so
  // the background drifts and the preview lifts as the user starts to scroll.
  // Disabled entirely when prefers-reduced-motion is set.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  })
  const bgY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 80])
  const previewY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [0, 0] : [0, -40]
  )
  const previewScale = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [1, 1] : [1, 0.98]
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (reduceMotion) return
    const interval = setInterval(() => {
      setSplit((prev) => (prev >= 58 ? 44 : 58))
    }, HERO_COMPARE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [reduceMotion])

  useEffect(() => {
    if (reduceMotion) return
    const interval = setInterval(() => {
      setAvatarPulse((prev) => (prev + 1) % 3)
    }, 1800)
    return () => clearInterval(interval)
  }, [reduceMotion])

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen overflow-hidden pt-28 pb-20 md:pt-32 md:pb-24"
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ y: bgY }}
      >
        <motion.div
          className="absolute inset-0 opacity-60"
          animate={
            reduceMotion
              ? undefined
              : {
                  background: [
                    "radial-gradient(circle 680px at 10% 15%, oklch(0.74 0.1 250 / 0.28) 0%, transparent 60%), radial-gradient(circle 520px at 80% 20%, oklch(0.75 0.08 190 / 0.24) 0%, transparent 65%), radial-gradient(circle 540px at 82% 78%, oklch(0.79 0.09 70 / 0.18) 0%, transparent 64%)",
                    "radial-gradient(circle 620px at 18% 28%, oklch(0.74 0.1 250 / 0.24) 0%, transparent 60%), radial-gradient(circle 560px at 84% 26%, oklch(0.75 0.08 190 / 0.3) 0%, transparent 65%), radial-gradient(circle 520px at 80% 74%, oklch(0.79 0.09 70 / 0.2) 0%, transparent 64%)",
                    "radial-gradient(circle 720px at 8% 18%, oklch(0.74 0.1 250 / 0.26) 0%, transparent 60%), radial-gradient(circle 540px at 78% 18%, oklch(0.75 0.08 190 / 0.24) 0%, transparent 65%), radial-gradient(circle 560px at 85% 76%, oklch(0.79 0.09 70 / 0.16) 0%, transparent 64%)",
                  ],
                }
          }
          style={
            reduceMotion
              ? {
                  background:
                    "radial-gradient(circle 680px at 10% 15%, oklch(0.74 0.1 250 / 0.28) 0%, transparent 60%), radial-gradient(circle 520px at 80% 20%, oklch(0.75 0.08 190 / 0.24) 0%, transparent 65%), radial-gradient(circle 540px at 82% 78%, oklch(0.79 0.09 70 / 0.18) 0%, transparent 64%)",
                }
              : undefined
          }
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>

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
              Graduate your fit.
              <br />
              <span className="text-gradient">{ROTATING_WORDS[wordIndex]}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg md:text-xl text-muted-foreground">
              Wear it before you buy it. Upload one photo, try any outfit from any
              store on the internet &mdash; photoreal results in under a minute.
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

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.85 }}
            className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl"
          >
            <div className="rounded-xl border border-border/70 bg-white/75 px-3 py-2 text-sm flex items-center gap-2">
              <Trophy className="size-4 text-amber-500" />
              Style XP +120
            </div>
            <div className="rounded-xl border border-border/70 bg-white/75 px-3 py-2 text-sm flex items-center gap-2">
              <Flame className="size-4 text-rose-500" />
              7-Day Streak
            </div>
            <div className="rounded-xl border border-border/70 bg-white/75 px-3 py-2 text-sm flex items-center gap-2 col-span-2 md:col-span-1">
              <Gem className="size-4 text-cyan-600" />
              Avatar Lab Unlocked
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.35 }}
          style={{ y: previewY, scale: previewScale }}
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

            <div className="relative h-[330px] md:h-[420px] overflow-hidden bg-muted">
              <Image
                src={HERO_COMPARE_BASE}
                alt="Hero compare: everyday look in a bright studio interior"
                fill
                className="object-cover"
                style={HERO_COMPARE_IMG_STYLE}
                sizes="(max-width: 1024px) 100vw, 520px"
                priority
              />
              <motion.div
                className="absolute inset-0 z-[1]"
                initial={false}
                animate={{ clipPath: `inset(0% 0% 0% ${100 - split}%)` }}
                transition={{
                  duration: HERO_COMPARE_TRANSITION_S,
                  ease: "easeInOut",
                }}
              >
                <Image
                  src={HERO_COMPARE_OUTFIT}
                  alt="Hero compare: elevated outfit in the same space"
                  fill
                  className="object-cover"
                  style={HERO_COMPARE_IMG_STYLE}
                  sizes="(max-width: 1024px) 100vw, 520px"
                  priority
                />
              </motion.div>

              <motion.div
                className="pointer-events-none absolute inset-y-0 z-[2] w-[2px] bg-white shadow-[0_0_0_1px_oklch(0.34_0.03_250/0.1)]"
                animate={{ left: `${100 - split}%` }}
                transition={{
                  duration: HERO_COMPARE_TRANSITION_S,
                  ease: "easeInOut",
                }}
              />

              <motion.div
                className="pointer-events-none absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 size-12 rounded-full border border-white bg-black/80 text-white flex items-center justify-center shadow-lg"
                animate={{ left: `${100 - split}%` }}
                transition={{
                  duration: HERO_COMPARE_TRANSITION_S,
                  ease: "easeInOut",
                }}
              >
                <Shirt className="size-5" />
              </motion.div>

              <div className="pointer-events-none absolute left-4 top-4 z-[3] rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
                Before
              </div>
              <div className="pointer-events-none absolute right-4 top-4 z-[3] rounded-full bg-black/80 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                After
              </div>

              <div className="pointer-events-none absolute left-4 bottom-4 right-4 z-[3] rounded-xl border border-white/70 bg-white/75 backdrop-blur-sm px-3 py-2 shadow-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Avatar Fit Score</span>
                  <span className="font-semibold text-foreground">{avatarPulse === 0 ? "84" : avatarPulse === 1 ? "88" : "91"}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/80 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-sky-500 to-emerald-400"
                    animate={{ width: avatarPulse === 0 ? "84%" : avatarPulse === 1 ? "88%" : "91%" }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
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
