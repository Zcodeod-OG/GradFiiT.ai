"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { Sparkles } from "lucide-react"

const COMPARE_BASE_SRC = "/landing/compare-model-base.png"
const COMPARE_OUTFIT_SRC = "/landing/compare-model-outfit.png"

/** Bias crop toward the top of the frame so full-body portraits keep the face in view. */
const COMPARE_IMG_POSITION = { objectPosition: "center top" as const }

/** ~20% less scroll sensitivity: same motion plays over ~25% more scroll progress. */
const SCROLL_OSC_INPUT = [0.03, 0.16, 0.28, 0.41, 0.53, 0.66, 0.78, 0.91] as const

/** Slightly narrower sweep (~15% less travel from center) so oscillation feels gentler. */
const SCROLL_OSC_OUTPUT = ["21%", "79%", "24%", "74%", "23%", "71%", "27%", "80%"] as const

/**
 * Before / after compare scrubber.
 *
 * Two interaction layers:
 *  1. As the section enters the viewport, the divider auto-scrubs back and forth
 *     based on scroll progress (gentler than a single sweep). This makes the section
 *     explain itself without requiring user interaction.
 *  2. Once the user mouses over (or taps), they take manual control and
 *     scroll-driven scrubbing is paused.
 *
 * Both are skipped when prefers-reduced-motion is set; the divider
 * defaults to 50% in that case.
 */
export function CompareScrubSection() {
  const sectionRef = useRef<HTMLElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [manualPos, setManualPos] = useState<number | null>(null)
  const reduce = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  })
  // Scroll progress maps to divider position; multiple keyframes make the
  // handle sweep back and forth so the outfit layer visibly oscillates.
  const autoX = useTransform(
    scrollYProgress,
    [...SCROLL_OSC_INPUT],
    reduce
      ? ["50%", "50%", "50%", "50%", "50%", "50%", "50%", "50%"]
      : [...SCROLL_OSC_OUTPUT]
  )

  const handlePointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (clientX - rect.left) / rect.width
    setManualPos(Math.max(4, Math.min(96, ratio * 100)))
  }

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-slate-950 py-24 text-white"
    >
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(120,180,255,0.4),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(255,140,200,0.35),transparent_55%)]" />
      </div>

      <div className="container-main relative">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            <Sparkles className="size-3.5" />
            See the difference
          </span>
          <h2 className="mt-4 font-display text-4xl md:text-5xl tracking-tight text-balance">
            Drag the slider. Watch yourself{" "}
            <span className="bg-gradient-to-r from-fuchsia-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
              wear the look.
            </span>
          </h2>
          <p className="mt-3 text-sm text-white/70">
            The auto-scrub plays as you scroll. Hover or tap to take over.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-4xl">
          <div
            ref={containerRef}
            onMouseMove={(event) => handlePointer(event.clientX)}
            onMouseLeave={() => setManualPos(null)}
            onTouchMove={(event) => {
              if (event.touches[0]) handlePointer(event.touches[0].clientX)
            }}
            className="relative aspect-[16/10] overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl"
          >
            {/* Before layer (full coverage) */}
            <BeforeLayer />

            {/* After layer clipped to the divider position */}
            <AfterLayer manualPos={manualPos} autoX={autoX} reduce={!!reduce} />

            {/* Divider + handle */}
            <Divider manualPos={manualPos} autoX={autoX} reduce={!!reduce} />

            <div className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white/85 backdrop-blur">
              Everyday
            </div>
            <div className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-900 backdrop-blur">
              Try-on
            </div>

            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/10 bg-black/45 px-4 py-2 text-center text-xs text-white/80 backdrop-blur">
              Demo preview — scroll scrubs the slider; hover or drag to compare.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function BeforeLayer() {
  return (
    <div className="absolute inset-0 bg-slate-900">
      <Image
        src={COMPARE_BASE_SRC}
        alt="Model in everyday outfit"
        fill
        className="object-cover"
        style={COMPARE_IMG_POSITION}
        sizes="(max-width: 896px) 100vw, 896px"
        priority
      />
    </div>
  )
}

function AfterLayer({
  manualPos,
  autoX,
  reduce,
}: {
  manualPos: number | null
  autoX: MotionValue<string>
  reduce: boolean
}) {
  // Always create the derived MotionValue (hooks must be unconditional);
  // the chosen `style.clipPath` below picks between the static and live
  // versions per render.
  const autoClip = useTransform(
    autoX,
    (value: string) => `inset(0 0 0 ${value})`
  )
  const useAuto = manualPos === null && !reduce
  const staticClip =
    manualPos !== null
      ? `inset(0 0 0 ${manualPos}%)`
      : "inset(0 0 0 50%)"

  return (
    <motion.div
      className="absolute inset-0 bg-slate-900"
      style={useAuto ? { clipPath: autoClip } : { clipPath: staticClip }}
    >
      <Image
        src={COMPARE_OUTFIT_SRC}
        alt="Model in try-on outfit"
        fill
        className="object-cover"
        style={COMPARE_IMG_POSITION}
        sizes="(max-width: 896px) 100vw, 896px"
        priority
      />
    </motion.div>
  )
}

function Divider({
  manualPos,
  autoX,
  reduce,
}: {
  manualPos: number | null
  autoX: MotionValue<string>
  reduce: boolean
}) {
  const left =
    manualPos !== null ? `${manualPos}%` : reduce ? "50%" : autoX
  return (
    <>
      <motion.div
        className="absolute inset-y-0 w-[2px] bg-white/95 shadow-[0_0_18px_rgba(255,255,255,0.35)]"
        style={{ left }}
      />
      <motion.div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-12 rounded-full border border-white/40 bg-black/70 text-white shadow-2xl backdrop-blur flex items-center justify-center"
        style={{ left }}
      >
        <span className="text-[10px] font-semibold tracking-wider">DRAG</span>
      </motion.div>
    </>
  )
}
