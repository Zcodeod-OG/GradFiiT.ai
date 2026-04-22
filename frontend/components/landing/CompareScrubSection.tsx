"use client"

import { useRef, useState } from "react"
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { Sparkles, Zap } from "lucide-react"

/**
 * Before / after compare scrubber.
 *
 * Two interaction layers:
 *  1. As the section enters the viewport, the divider auto-scrubs from 12%
 *     to 88% based on scroll position. This makes the section "explain
 *     itself" without requiring user interaction.
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
  const autoX = useTransform(
    scrollYProgress,
    [0.15, 0.45, 0.7],
    reduce ? ["50%", "50%", "50%"] : ["12%", "60%", "88%"]
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
              Before
            </div>
            <div className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-900 backdrop-blur">
              After
            </div>

            <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/45 px-4 py-2 text-xs text-white/85 backdrop-blur">
              <span className="inline-flex items-center gap-2">
                <Zap className="size-3.5 text-emerald-300" />
                Identity match: 0.93
              </span>
              <span>Generated in 11.4s</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function BeforeLayer() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#1e293b_0%,#0f172a_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.16),transparent_55%)]" />
      {/* Studio floor */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(148,163,184,0.18))]" />
      {/* Mannequin silhouette - plain */}
      <div className="absolute inset-0 flex items-end justify-center pb-6">
        <svg
          viewBox="0 0 200 320"
          className="h-[78%] w-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]"
          aria-hidden
        >
          <defs>
            <linearGradient id="cs_before_body" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#475569" stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="cs_before_tee" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#64748b" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          {/* Head */}
          <ellipse cx="100" cy="40" rx="22" ry="28" fill="url(#cs_before_body)" />
          {/* Neck */}
          <rect x="92" y="66" width="16" height="14" fill="url(#cs_before_body)" />
          {/* Torso in plain tee */}
          <path
            d="M60 82 Q100 76 140 82 L148 170 Q100 180 52 170 Z"
            fill="url(#cs_before_tee)"
          />
          {/* Arms */}
          <path d="M60 86 Q42 130 38 175 L50 177 Q56 134 72 92 Z" fill="url(#cs_before_body)" />
          <path d="M140 86 Q158 130 162 175 L150 177 Q144 134 128 92 Z" fill="url(#cs_before_body)" />
          {/* Hips + plain pants */}
          <path
            d="M58 170 Q100 178 142 170 L150 300 L116 300 L100 190 L84 300 L50 300 Z"
            fill="url(#cs_before_body)"
          />
          {/* Floor shadow */}
          <ellipse cx="100" cy="308" rx="70" ry="5" fill="rgba(0,0,0,0.55)" />
        </svg>
      </div>
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
      className="absolute inset-0"
      style={useAuto ? { clipPath: autoClip } : { clipPath: staticClip }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#1a1242_0%,#0c1838_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(180,200,255,0.45),transparent_55%)]" />
      {/* Spotlight */}
      <div className="absolute left-1/2 top-[10%] h-[70%] w-[55%] -translate-x-1/2 rounded-full opacity-85 [background:radial-gradient(closest-side,rgba(255,240,220,0.5),transparent_70%)]" />
      {/* Runway floor */}
      <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(180,200,255,0.25))]" />
      {/* Styled figure */}
      <div className="absolute inset-0 flex items-end justify-center pb-6">
        <svg
          viewBox="0 0 200 320"
          className="h-[78%] w-auto drop-shadow-[0_22px_40px_rgba(10,20,60,0.75)]"
          aria-hidden
        >
          <defs>
            <linearGradient id="cs_after_body" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#1c2642" />
              <stop offset="100%" stopColor="#0e1428" />
            </linearGradient>
            <linearGradient id="cs_after_outfit" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F472B6" />
              <stop offset="50%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
            <linearGradient id="cs_after_skirt" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
            <radialGradient id="cs_after_face" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,230,200,0.9)" />
              <stop offset="100%" stopColor="rgba(255,230,200,0)" />
            </radialGradient>
          </defs>
          {/* Head + soft glow */}
          <circle cx="100" cy="42" r="40" fill="url(#cs_after_face)" opacity="0.5" />
          <ellipse cx="100" cy="40" rx="22" ry="28" fill="url(#cs_after_body)" />
          <rect x="92" y="66" width="16" height="14" fill="url(#cs_after_body)" />
          {/* Styled top */}
          <path
            d="M60 82 Q100 76 140 82 L148 170 Q100 182 52 170 Z"
            fill="url(#cs_after_outfit)"
          />
          {/* Waist highlight */}
          <path d="M56 150 Q100 162 144 150" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" />
          {/* Arms */}
          <path d="M60 86 Q42 130 38 175 L50 177 Q56 134 72 92 Z" fill="url(#cs_after_body)" />
          <path d="M140 86 Q158 130 162 175 L150 177 Q144 134 128 92 Z" fill="url(#cs_after_body)" />
          {/* Flowing skirt */}
          <path
            d="M58 168 Q100 180 142 168 L170 300 L30 300 Z"
            fill="url(#cs_after_skirt)"
            opacity="0.92"
          />
          {/* Skirt shine */}
          <path d="M85 180 L80 298" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <path d="M115 180 L122 298" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          {/* Floor shadow */}
          <ellipse cx="100" cy="308" rx="80" ry="6" fill="rgba(0,0,0,0.55)" />
        </svg>
      </div>
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
