"use client"

import { useEffect, useRef, useState } from "react"
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { Camera, ImageDown, ShieldCheck, Sparkles } from "lucide-react"

/**
 * Cinematic rampwalk scrollytelling.
 *
 * Pins a full-bleed cinema stage. A landscape runway clip at
 * /public/landing/rampwalk.mp4 is scroll-scrubbed: video.currentTime is
 * driven by scroll progress, with seeks coalesced into one per animation
 * frame so fast trackpad scrolls don't flood the decoder. Scene narrative
 * cards fade in/out alongside the scrubbed video.
 *
 * Collapses to a static stacked layout when prefers-reduced-motion is set.
 */

type Scene = {
  id: string
  title: string
  body: string
  badge: string
  icon: typeof Camera
  accent: string
}

const SCENES: Scene[] = [
  {
    id: "upload",
    title: "Drop one photo. Forever.",
    body:
      "Upload once. We smart-crop, blur-check, and pre-cache your face embedding so every future try-on starts at full speed.",
    badge: "01 — Upload",
    icon: Camera,
    accent: "from-fuchsia-500 via-rose-400 to-amber-300",
  },
  {
    id: "fit",
    title: "Fashion-grade VTON, in seconds.",
    body:
      "We route the look through a tier-1 commercial VTON provider with multi-sample fallback. Most outfits land in under 12 seconds.",
    badge: "02 — Generate",
    icon: Sparkles,
    accent: "from-sky-500 via-indigo-500 to-violet-500",
  },
  {
    id: "verify",
    title: "Identity-locked, every time.",
    body:
      "A CLIP-based identity check makes sure the result still looks like you. If drift is detected, we automatically re-roll with the next sample.",
    badge: "03 — Verify",
    icon: ShieldCheck,
    accent: "from-emerald-500 via-teal-400 to-cyan-400",
  },
  {
    id: "polish",
    title: "Polished. Upscaled. Ready.",
    body:
      "GFPGAN restores facial detail, Real-ESRGAN upscales the output, and the final image lands in your closet ready to share.",
    badge: "04 — Polish",
    icon: ImageDown,
    accent: "from-amber-400 via-orange-400 to-rose-400",
  },
]

const N = SCENES.length
const FADE_HALF = 0.09

/** Opacity [0,1,1,0] over a scene's slice with overlap into its neighbors. */
function useSceneOpacity(
  progress: MotionValue<number>,
  index: number,
  reduce: boolean,
) {
  const start = index / N
  const end = (index + 1) / N
  const keyframes: [number, number, number, number] = [
    start - FADE_HALF,
    start + FADE_HALF,
    end - FADE_HALF,
    end + FADE_HALF,
  ]
  return useTransform(
    progress,
    keyframes,
    reduce ? [1, 1, 1, 1] : [0, 1, 1, 0],
  )
}

const RAMPWALK_VIDEO_SRC = "/landing/rampwalk.mp4"

export function ScrollStory() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const reduce = useReducedMotion()

  // Raw scrollYProgress, no spring. A spring layer made the video drift
  // behind the cursor on fast scrolls (visible lag); coalesced rAF seeks
  // in CinemaVideo handle aggressive scrolling without the smoothing.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })

  const progressPct = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <section className="relative overflow-x-clip bg-slate-950 text-white">
      {/* Ambient mesh peeking above/below the pinned stage */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(79,124,255,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(1000px_500px_at_85%_10%,rgba(14,165,233,0.14),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(800px_500px_at_50%_110%,rgba(52,211,153,0.14),transparent_55%)]" />
      </div>

      <div className="container-main relative pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 backdrop-blur">
            <Sparkles className="size-3.5" />
            How GradFiT works
          </span>
          <h2 className="mt-4 font-display text-4xl md:text-5xl tracking-tight text-balance">
            One photo. Many outfits.{" "}
            <span className="bg-gradient-to-r from-fuchsia-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
              Zero friction.
            </span>
          </h2>
          <p className="mt-3 text-sm text-white/70">
            Scroll to watch the model walk through the four moments of a
            GradFiT try-on.
          </p>
        </div>
      </div>

      {/* Pinned cinema stage. 520vh gives each of the 4 scenes ~105vh of
          actual pinned scroll (after subtracting the ~100vh pin height). */}
      <div
        ref={containerRef}
        className="relative mt-10"
        style={{ height: reduce ? "auto" : "520vh" }}
      >
        <div
          className={
            reduce
              ? "relative h-auto"
              : "sticky top-16 md:top-20 h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] overflow-hidden"
          }
        >
          {/* z-0: video (or SVG fallback) */}
          <CinemaStage progress={scrollYProgress} reduce={!!reduce} />

          {/* z-5: gradient bands for narrative-card legibility. Top + bottom
              only — side bands were tied to the removed right-side artifact
              rail and just dimmed the runway unnecessarily. */}
          <StageVignettes />

          {/* z-20: floating narrative cards.
              Mobile: bottom sheet above the progress dots.
              Desktop: left gutter, anchored slightly above center so it
              doesn't sit over the model's face.
              Cards stacked via 1x1 CSS grid so the container hugs the
              tallest card. */}
          <div className="pointer-events-none absolute z-20 left-3 right-3 bottom-24 sm:left-5 sm:right-5 lg:right-auto lg:left-6 xl:left-10 lg:top-[42%] lg:-translate-y-1/2 lg:bottom-auto lg:w-[min(420px,36vw)]">
            <div className="grid">
              {SCENES.map((scene, idx) => (
                <SceneTextCard
                  key={scene.id}
                  scene={scene}
                  index={idx}
                  progress={scrollYProgress}
                  reduce={!!reduce}
                />
              ))}
            </div>
          </div>

          {/* z-30: progress dots + rail */}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
              {SCENES.map((s, idx) => (
                <SceneDot
                  key={s.id}
                  index={idx}
                  label={s.badge.split(" — ")[1] ?? s.id}
                  progress={scrollYProgress}
                  reduce={!!reduce}
                />
              ))}
            </div>
            <div className="h-[3px] w-56 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-sky-400 to-emerald-400"
                style={{ width: reduce ? "100%" : progressPct }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ================================================================== */
/* Cinema stage: full-bleed video with SVG fallback                   */
/* ================================================================== */

function CinemaStage({
  progress,
  reduce,
}: {
  progress: MotionValue<number>
  reduce: boolean
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[linear-gradient(180deg,#060a1a_0%,#020410_100%)]">
      {!failed && (
        <CinemaVideo
          progress={progress}
          reduce={reduce}
          onFail={() => setFailed(true)}
        />
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-[80%] w-[34%] min-w-[280px] max-w-[460px]">
            <RunwayModel progress={progress} reduce={reduce} />
          </div>
        </div>
      )}
    </div>
  )
}

function CinemaVideo({
  progress,
  reduce,
  onFail,
}: {
  progress: MotionValue<number>
  reduce: boolean
  onFail: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [ready, setReady] = useState(false)
  // rAF coalescing: scroll fires hundreds of motion events per second on
  // fast trackpad flicks. Setting video.currentTime on each one queues
  // seeks the decoder can't service in time, producing the "laggy" feel.
  // Instead, we stash the latest target and apply at most one seek per
  // animation frame (~60Hz).
  const targetTimeRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onMeta = () => {
      setReady(true)
      // Paint the first frame immediately so the stage isn't a black box
      // before the user scrolls.
      try {
        v.currentTime = 0.01
      } catch {
        // some browsers throw if metadata isn't loaded yet — ignore
      }
    }
    const onLoadedData = () => setReady(true)
    const onErr = () => onFail()

    v.addEventListener("loadedmetadata", onMeta)
    v.addEventListener("loadeddata", onLoadedData)
    v.addEventListener("error", onErr)

    try {
      v.load()
    } catch {
      // ignore
    }

    return () => {
      v.removeEventListener("loadedmetadata", onMeta)
      v.removeEventListener("loadeddata", onLoadedData)
      v.removeEventListener("error", onErr)
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [onFail])

  useMotionValueEvent(progress, "change", (v) => {
    const vid = videoRef.current
    if (!vid || !ready || reduce) return
    const duration = vid.duration
    if (!duration || !isFinite(duration)) return
    targetTimeRef.current = Math.max(0, Math.min(v * duration, duration - 0.05))
    if (rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const target = targetTimeRef.current
        if (Math.abs(vid.currentTime - target) > 0.03) {
          try {
            vid.currentTime = target
          } catch {
            // safari sometimes throws if we seek before metadata fully stable
          }
        }
      })
    }
  })

  return (
    <div className="absolute inset-0 bg-slate-950">
      <video
        ref={videoRef}
        src={RAMPWALK_VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        disableRemotePlayback
        tabIndex={-1}
        aria-hidden
        className={
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-500 " +
          (ready ? "opacity-100" : "opacity-0")
        }
      />
    </div>
  )
}

/* ================================================================== */
/* Stage vignettes: gradient bands for narrative-card legibility      */
/* ================================================================== */

function StageVignettes() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/80 via-slate-950/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
      {/* Left band — keeps the narrative card readable on desktop. */}
      <div className="absolute inset-y-0 left-0 hidden w-[30rem] bg-gradient-to-r from-slate-950/80 via-slate-950/35 to-transparent lg:block" />
    </div>
  )
}

/* ================================================================== */
/* SVG fashion silhouette fallback (video.error path)                  */
/* ================================================================== */

function RunwayModel({
  progress,
  reduce,
}: {
  progress: MotionValue<number>
  reduce: boolean
}) {
  const bounce = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (reduce || !bounce.current) return
    const el = bounce.current
    let rafId = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      const y = Math.sin(t * 1.6) * 3
      el.style.transform = `translate3d(0, ${y}px, 0)`
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [reduce])

  const figureScale = useTransform(
    progress,
    [0, 1],
    reduce ? [1, 1] : [0.9, 1.06],
  )

  return (
    <motion.div style={{ scale: figureScale }} className="absolute inset-0">
      <div ref={bounce} className="absolute inset-0">
        <svg
          viewBox="0 0 400 800"
          className="h-full w-full drop-shadow-[0_30px_50px_rgba(0,0,0,0.55)]"
          aria-hidden
        >
          <defs>
            <linearGradient id="rs_body" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#1c2642" />
              <stop offset="100%" stopColor="#0e1428" />
            </linearGradient>
            <linearGradient id="rs_outfit_polish" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="50%" stopColor="#0EA5E9" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
          </defs>
          <ellipse cx="200" cy="90" rx="42" ry="54" fill="url(#rs_body)" />
          <rect x="188" y="140" width="24" height="28" fill="url(#rs_body)" />
          <path
            d="M145 170 Q200 162 255 170 L270 340 Q200 360 130 340 Z"
            fill="url(#rs_outfit_polish)"
          />
          <path
            d="M145 178 Q118 250 110 360 L130 362 Q138 258 160 188 Z"
            fill="url(#rs_body)"
          />
          <path
            d="M255 178 Q282 250 290 360 L270 362 Q262 258 240 188 Z"
            fill="url(#rs_body)"
          />
          <path
            d="M130 355 Q200 370 270 355 L290 520 Q200 540 110 520 Z"
            fill="url(#rs_outfit_polish)"
            opacity="0.9"
          />
          <path
            d="M150 340 Q170 350 198 352 L188 720 L162 720 Z"
            fill="url(#rs_body)"
          />
          <path
            d="M250 340 Q230 350 202 352 L212 720 L238 720 Z"
            fill="url(#rs_body)"
          />
          <ellipse cx="200" cy="748" rx="80" ry="8" fill="rgba(0,0,0,0.55)" />
        </svg>
      </div>
    </motion.div>
  )
}

/* ================================================================== */
/* Narrative text card                                                 */
/* ================================================================== */

function SceneTextCard({
  scene,
  index,
  progress,
  reduce,
}: {
  scene: Scene
  index: number
  progress: MotionValue<number>
  reduce: boolean
}) {
  const opacity = useSceneOpacity(progress, index, reduce)
  const y = useTransform(
    progress,
    [index / N - FADE_HALF, index / N + FADE_HALF],
    reduce ? [0, 0] : [16, 0],
  )

  const Icon = scene.icon

  return (
    <motion.div
      style={reduce ? undefined : { opacity, y }}
      className="pointer-events-auto col-start-1 row-start-1 rounded-2xl border border-white/15 bg-slate-950/80 p-5 sm:p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl ring-1 ring-white/5"
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${scene.accent}`}
        >
          <Icon className="size-5" />
        </span>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
            {scene.badge.split(" — ")[0]}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            {scene.badge.split(" — ")[1] ?? scene.id}
          </span>
        </div>
      </div>
      <h3 className="mt-4 font-display text-[22px] leading-[1.15] text-white text-balance sm:text-2xl lg:text-[26px] xl:text-[28px]">
        {scene.title}
      </h3>
      <p className="mt-3 text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
        {scene.body}
      </p>
    </motion.div>
  )
}

/* ================================================================== */
/* Bottom scene dots                                                   */
/* ================================================================== */

function SceneDot({
  index,
  label,
  progress,
  reduce,
}: {
  index: number
  label: string
  progress: MotionValue<number>
  reduce: boolean
}) {
  const start = index / N
  const end = (index + 1) / N
  const fill = useTransform(
    progress,
    [start - 0.02, start + 0.02, end - 0.02, end + 0.02],
    reduce ? [1, 1, 1, 1] : [0.25, 1, 1, 0.35],
  )
  const width = useTransform(
    progress,
    [start - 0.02, start + 0.04, end - 0.04, end + 0.02],
    reduce ? [32, 32, 32, 32] : [10, 56, 56, 10],
  )

  return (
    <motion.div
      style={{ opacity: fill, width }}
      className="flex h-5 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-fuchsia-400 via-sky-400 to-emerald-400 px-2"
    >
      <motion.span
        style={{ opacity: fill }}
        className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.2em] text-slate-950"
      >
        {label}
      </motion.span>
    </motion.div>
  )
}
