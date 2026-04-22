"use client"

import { useEffect, useRef, useState } from "react"
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { Camera, ImageDown, ShieldCheck, Sparkles } from "lucide-react"

/**
 * Cinematic rampwalk scrollytelling.
 *
 * The section pins a full-bleed cinema stage. A landscape runway clip at
 * /public/landing/rampwalk.mp4 is scroll-scrubbed: `video.currentTime` is
 * driven by the user's scroll through the pinned 240vh container. Scene
 * annotations (crop corners, frame-builder, ID scan beam, sparkles) layer
 * on top of the video so the narrative remains readable regardless of what
 * the video frame is doing.
 *
 * If the video fails to load (missing file, unsupported codec), the SVG
 * fashion silhouette takes over in the same layer.
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
  artifact: "crop" | "generate" | "verify" | "polish"
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
    artifact: "crop",
  },
  {
    id: "fit",
    title: "Fashion-grade VTON, in seconds.",
    body:
      "We route the look through a tier-1 commercial VTON provider with multi-sample fallback. Most outfits land in under 12 seconds.",
    badge: "02 — Generate",
    icon: Sparkles,
    accent: "from-sky-500 via-indigo-500 to-violet-500",
    artifact: "generate",
  },
  {
    id: "verify",
    title: "Identity-locked, every time.",
    body:
      "A CLIP-based identity check makes sure the result still looks like you. If drift is detected, we automatically re-roll with the next sample.",
    badge: "03 — Verify",
    icon: ShieldCheck,
    accent: "from-emerald-500 via-teal-400 to-cyan-400",
    artifact: "verify",
  },
  {
    id: "polish",
    title: "Polished. Upscaled. Ready.",
    body:
      "GFPGAN restores facial detail, Real-ESRGAN upscales the output, and the final image lands in your closet ready to share.",
    badge: "04 — Polish",
    icon: ImageDown,
    accent: "from-amber-400 via-orange-400 to-rose-400",
    artifact: "polish",
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

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })

  // Smooth the raw scroll progress with a gentle spring. Fast trackpad
  // flicks then ease into the target position instead of jumping, which
  // keeps each scene readable even when the user scrolls aggressively.
  // Under reduced motion we skip the spring entirely.
  const smoothedProgress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 24,
    mass: 0.6,
    restDelta: 0.0005,
  })
  const storyProgress = reduce ? scrollYProgress : smoothedProgress

  const progressPct = useTransform(storyProgress, [0, 1], ["0%", "100%"])

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
          actual pinned scroll (after subtracting the ~100vh pin height),
          so a normal trackpad flick (~200-500px per tick) still spends
          several ticks per scene instead of blowing past the whole story
          in one gesture. Under prefers-reduced-motion the section
          collapses to a stacked layout with no sticky pinning. */}
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
          <CinemaStage progress={storyProgress} reduce={!!reduce} />

          {/* z-5: gradient bands for legibility over bright frames */}
          <StageVignettes />

          {/* z-10: scene-specific SVG annotations on top of the video */}
          <StageAnnotations progress={storyProgress} reduce={!!reduce} />

          {/* z-20: floating text rail.
              Mobile: bottom sheet above the progress dots.
              Desktop: left gutter, anchored slightly above center so it
              doesn't sit over the model's face.
              Cards are stacked via 1x1 CSS grid so the container hugs
              the tallest card (no fixed height, no empty pockets). */}
          <div className="pointer-events-none absolute z-20 left-3 right-3 bottom-24 sm:left-5 sm:right-5 lg:right-auto lg:left-6 xl:left-10 lg:top-[42%] lg:-translate-y-1/2 lg:bottom-auto lg:w-[min(420px,36vw)]">
            <div className="grid">
              {SCENES.map((scene, idx) => (
                <SceneTextCard
                  key={scene.id}
                  scene={scene}
                  index={idx}
                  progress={storyProgress}
                  reduce={!!reduce}
                />
              ))}
            </div>
          </div>

          {/* z-20: floating artifact rail (right, desktop only) */}
          <div className="pointer-events-none absolute z-20 right-6 xl:right-10 top-[42%] -translate-y-1/2 hidden w-[min(360px,30vw)] lg:block">
            <div className="grid">
              {SCENES.map((scene, idx) => (
                <ArtifactCard
                  key={scene.id}
                  scene={scene}
                  index={idx}
                  progress={storyProgress}
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
                  progress={storyProgress}
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

      {/* SVG fallback - shown only when video failed to load. */}
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
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

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
        // some browsers throw if metadata isn't loaded yet - ignore
      }
    }
    const onLoadedData = () => {
      setReady(true)
    }
    const onErr = () => onFail()

    v.addEventListener("loadedmetadata", onMeta)
    v.addEventListener("loadeddata", onLoadedData)
    v.addEventListener("error", onErr)

    // Nudge the browser on mount in case the poster frame isn't rendering.
    try {
      v.load()
    } catch {
      // ignore
    }

    return () => {
      v.removeEventListener("loadedmetadata", onMeta)
      v.removeEventListener("loadeddata", onLoadedData)
      v.removeEventListener("error", onErr)
    }
  }, [onFail])

  // Drive video.currentTime from scroll progress, rate-limited so we don't
  // flood the decoder on fast scrolls.
  useMotionValueEvent(progress, "change", (v) => {
    const vid = videoRef.current
    if (!vid || !ready) return
    if (reduce) {
      // Leave on first frame under reduced motion.
      return
    }
    const duration = vid.duration
    if (!duration || !isFinite(duration)) return
    const target = Math.max(0, Math.min(v * duration, duration - 0.05))
    if (Math.abs(vid.currentTime - target) > 0.04) {
      try {
        vid.currentTime = target
      } catch {
        // safari sometimes throws if we seek before metadata fully stable
      }
    }
  })

  return (
    <div ref={wrapperRef} className="absolute inset-0 bg-slate-950">
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
      {/* Subtle radial halo to keep the model readable when the video is dim. */}
      <div className="pointer-events-none absolute left-1/2 top-[45%] h-[75%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full [background:radial-gradient(closest-side,rgba(255,240,220,0.10),transparent_70%)]" />
    </div>
  )
}

/* ================================================================== */
/* Stage vignettes: gradient bands for text/HUD legibility            */
/* ================================================================== */

function StageVignettes() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {/* Top band (kept short so it doesn't eat into the model's head) */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/80 via-slate-950/30 to-transparent" />
      {/* Bottom band - taller so it also dims behind the mobile text sheet
          and the progress dots at bottom-5. */}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
      {/* Left/right dimming behind the rails - sized to match the rail
          widths so the cards always sit over legible backdrop. */}
      <div className="absolute inset-y-0 left-0 hidden w-[30rem] bg-gradient-to-r from-slate-950/80 via-slate-950/35 to-transparent lg:block" />
      <div className="absolute inset-y-0 right-0 hidden w-[26rem] bg-gradient-to-l from-slate-950/75 via-slate-950/30 to-transparent lg:block" />
    </div>
  )
}

/* ================================================================== */
/* Scene annotations: SVG overlays on top of the video                */
/* ================================================================== */

function StageAnnotations({
  progress,
  reduce,
}: {
  progress: MotionValue<number>
  reduce: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden
    >
      <AnnotationUpload progress={progress} reduce={reduce} />
      <AnnotationGenerate progress={progress} reduce={reduce} />
      <AnnotationVerify progress={progress} reduce={reduce} />
      <AnnotationPolish progress={progress} reduce={reduce} />
    </div>
  )
}

function AnnotationUpload({
  progress,
  reduce,
}: {
  progress: MotionValue<number>
  reduce: boolean
}) {
  const opacity = useSceneOpacity(progress, 0, reduce)
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      {/* Crop corners drawn around the middle-upper area where faces usually sit */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* Four L-brackets around the face region (approx 35-65% x, 18-48% y) */}
        {([
          [35, 18, 1, 1], // tl
          [65, 18, -1, 1], // tr
          [35, 48, 1, -1], // bl
          [65, 48, -1, -1], // br
        ] as const).map(([x, y, dx, dy], i) => (
          <g key={i} stroke="#F0ABFC" strokeWidth="0.4" fill="none">
            <line x1={x} y1={y} x2={x + dx * 4} y2={y} />
            <line x1={x} y1={y} x2={x} y2={y + dy * 4} />
          </g>
        ))}
        {/* Dashed outer box */}
        <rect
          x="35"
          y="18"
          width="30"
          height="30"
          fill="none"
          stroke="#F0ABFC"
          strokeOpacity="0.55"
          strokeWidth="0.25"
          strokeDasharray="1 1.2"
          rx="1.2"
        />
        {/* Tracking tick dots */}
        {[35, 65].map((x) =>
          [18, 48].map((y) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="0.8"
              fill="#F0ABFC"
            />
          )),
        )}
      </svg>

      {/* Embed-dot cluster in top-right corner */}
      <div className="absolute right-6 top-16 hidden h-28 w-40 rounded-xl border border-fuchsia-400/40 bg-black/55 p-3 backdrop-blur md:block">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-fuchsia-200/90">
          Face embedding
        </div>
        <svg viewBox="0 0 100 60" className="mt-1 h-16 w-full">
          {Array.from({ length: 22 }).map((_, i) => {
            const cx = 10 + (i * 7) % 85 + Math.sin(i) * 3
            const cy = 10 + ((i * 13) % 45) + Math.cos(i) * 2
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={1 + (i % 3) * 0.5}
                fill="rgba(240,171,252,0.85)"
              >
                {!reduce && (
                  <animate
                    attributeName="opacity"
                    values="0.4;1;0.4"
                    dur={`${1.6 + (i % 4) * 0.3}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            )
          })}
        </svg>
        <div className="mt-1 text-[9px] text-white/60">
          512-dim · cached · 0.94
        </div>
      </div>

      {/* Upload metric pill near top-center */}
      <div className="absolute left-1/2 top-8 -translate-x-1/2 rounded-full border border-fuchsia-400/50 bg-black/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-100 backdrop-blur">
        Smart-crop · OK
      </div>
    </motion.div>
  )
}

function AnnotationGenerate({
  progress,
  reduce,
}: {
  progress: MotionValue<number>
  reduce: boolean
}) {
  const opacity = useSceneOpacity(progress, 1, reduce)
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      {/* Stage border that traces a gradient "frame builder". */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="ss_gen_frame" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="60%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="98"
          height="98"
          fill="none"
          stroke="url(#ss_gen_frame)"
          strokeWidth="0.4"
          strokeDasharray="50 400"
          strokeDashoffset="0"
          rx="1.2"
        >
          {!reduce && (
            <animate
              attributeName="stroke-dashoffset"
              values="0;-450"
              dur="3.4s"
              repeatCount="indefinite"
            />
          )}
        </rect>
      </svg>

      {/* Timer pill (top-right) */}
      <div className="absolute right-8 top-20 flex items-center gap-2 rounded-full border border-sky-400/40 bg-black/70 px-3 py-1.5 backdrop-blur">
        <span className="relative flex size-2">
          <span className="absolute inset-0 rounded-full bg-sky-300 opacity-70">
            {!reduce && (
              <span className="absolute inset-0 animate-ping rounded-full bg-sky-300" />
            )}
          </span>
          <span className="relative inline-flex size-2 rounded-full bg-sky-300" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
          Generating · 11.4s
        </span>
      </div>

      {/* Generate label (bottom-left) */}
      <div className="absolute left-1/2 top-10 -translate-x-1/2 rounded-full border border-indigo-400/40 bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-100 backdrop-blur">
        Fashn · tryon-v1.6 · balanced
      </div>
    </motion.div>
  )
}

function AnnotationVerify({
  progress,
  reduce,
}: {
  progress: MotionValue<number>
  reduce: boolean
}) {
  const opacity = useSceneOpacity(progress, 2, reduce)
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      {/* Horizontal scan beam sweeping top to bottom */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="ss_scan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(110,231,183,0)" />
            <stop offset="50%" stopColor="rgba(110,231,183,0.95)" />
            <stop offset="100%" stopColor="rgba(110,231,183,0)" />
          </linearGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width="100"
          height="0.4"
          fill="url(#ss_scan)"
        >
          {!reduce && (
            <animate
              attributeName="y"
              values="15;70;15"
              dur="2.8s"
              repeatCount="indefinite"
            />
          )}
        </rect>
        {/* Face target ring */}
        <circle
          cx="50"
          cy="32"
          r="10"
          fill="none"
          stroke="#6EE7B7"
          strokeOpacity="0.75"
          strokeWidth="0.35"
          strokeDasharray="1.2 1"
        >
          {!reduce && (
            <animate
              attributeName="r"
              values="10;11;10"
              dur="2s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      </svg>

      {/* ID MATCH pill - top-center */}
      <div className="absolute left-1/2 top-8 -translate-x-1/2 flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)] backdrop-blur">
        <span className="size-1.5 rounded-full bg-white" />
        ID Match · 0.94
      </div>

      {/* Candidate strip (bottom-left on desktop) */}
      <div className="absolute left-8 bottom-28 hidden items-center gap-1 rounded-xl border border-white/15 bg-black/55 p-1.5 backdrop-blur md:flex">
        <div className="relative size-12 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-rose-500 to-orange-500">
          <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[8px] font-bold text-white">
            0.78
          </span>
        </div>
        <div className="relative size-12 overflow-hidden rounded-lg border border-emerald-400/80 bg-gradient-to-br from-emerald-400 to-sky-400">
          <span className="absolute left-0.5 top-0.5 rounded bg-emerald-500 px-1 text-[8px] font-bold text-white">
            0.94
          </span>
          <span className="absolute right-0.5 bottom-0.5 rounded bg-emerald-500 px-1 text-[8px] font-bold text-white">
            ✓
          </span>
        </div>
      </div>
    </motion.div>
  )
}

function AnnotationPolish({
  progress,
  reduce,
}: {
  progress: MotionValue<number>
  reduce: boolean
}) {
  const opacity = useSceneOpacity(progress, 3, reduce)
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      {/* Sparkle stars scattered around the edges */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {[
          [10, 18],
          [88, 22],
          [16, 52],
          [92, 58],
          [22, 82],
          [82, 78],
          [48, 12],
          [50, 88],
          [30, 30],
          [72, 30],
        ].map(([cx, cy], i) => (
          <g key={i} transform={`translate(${cx} ${cy})`}>
            <path
              d="M0 -2 L0.4 -0.4 L2 0 L0.4 0.4 L0 2 L-0.4 0.4 L-2 0 L-0.4 -0.4 Z"
              fill="rgba(255,255,255,0.95)"
            >
              {!reduce && (
                <animate
                  attributeName="opacity"
                  values="0.2;1;0.2"
                  dur={`${1.4 + (i % 5) * 0.25}s`}
                  repeatCount="indefinite"
                />
              )}
            </path>
          </g>
        ))}
      </svg>

      {/* 4K · CLEAN badge top-right */}
      <div className="absolute right-8 top-20 flex items-center gap-2 rounded-full border border-white/30 bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-900 shadow-[0_10px_30px_rgba(255,255,255,0.15)] backdrop-blur">
        <span className="size-1.5 rounded-full bg-amber-500" />
        4K · Clean
      </div>

      {/* Polish label top-center */}
      <div className="absolute left-1/2 top-8 -translate-x-1/2 rounded-full border border-amber-400/50 bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100 backdrop-blur">
        GFPGAN · ESRGAN 2x
      </div>
    </motion.div>
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
/* Left text rail                                                      */
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
      className={
        // `col-start-1 row-start-1` stacks every card in the same grid
        // cell so the rail container hugs the tallest card's natural
        // height. Cards size to their content - no empty pockets, no
        // overflow.
        "pointer-events-auto col-start-1 row-start-1 rounded-2xl border border-white/15 bg-slate-950/80 p-5 sm:p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl ring-1 ring-white/5"
      }
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
/* Right artifact HUD                                                  */
/* ================================================================== */

function ArtifactCard({
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
    reduce ? [0, 0] : [20, 0],
  )

  return (
    <motion.div
      style={reduce ? undefined : { opacity, y }}
      className="pointer-events-auto col-start-1 row-start-1 rounded-2xl border border-white/10 bg-black/70 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl ring-1 ring-white/5"
    >
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
        <span>Behind the scenes</span>
        <span>{scene.badge.split(" — ")[0]}</span>
      </div>
      <div className="mt-3">
        {scene.artifact === "crop" && <ArtifactCrop />}
        {scene.artifact === "generate" && <ArtifactGenerate reduce={reduce} />}
        {scene.artifact === "verify" && <ArtifactVerify />}
        {scene.artifact === "polish" && <ArtifactPolish />}
      </div>
    </motion.div>
  )
}

function ArtifactCrop() {
  return (
    <div className="space-y-3">
      <div className="relative h-40 overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="absolute left-1/2 top-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-rose-300 to-fuchsia-500 shadow-xl" />
        <div className="absolute left-1/2 top-[28%] h-20 w-24 -translate-x-1/2 rounded-lg border-2 border-dashed border-fuchsia-300/90" />
        <span className="absolute right-2 top-2 rounded bg-fuchsia-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
          CROP
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-white/75">
        <Metric label="Blur" value="OK" tone="good" />
        <Metric label="Coverage" value="92%" tone="good" />
        <Metric label="Face" value="Found" tone="good" />
      </div>
      <p className="text-[11px] leading-snug text-white/60">
        Smart-crop + CLIP face embedding cached on upload.
      </p>
    </div>
  )
}

function ArtifactGenerate({ reduce }: { reduce: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="aspect-square rounded-lg bg-gradient-to-br from-indigo-400 via-sky-400 to-cyan-300 shadow-inner" />
        <span className="text-center text-lg text-white/60">→</span>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-800">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.2),transparent_55%)]" />
          <div className="absolute inset-x-3 bottom-1 top-6 rounded bg-gradient-to-b from-indigo-400 to-sky-500 opacity-80" />
          <div className="absolute left-1/2 top-2 size-5 -translate-x-1/2 rounded-full bg-gradient-to-br from-amber-200 to-rose-300" />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-[11px] text-white/75">
        <span>Balanced · Fashn tryon-v1.6</span>
        <span className="flex items-center gap-1 font-semibold text-sky-300">
          <span className="relative flex size-1.5">
            {!reduce && (
              <span className="absolute inset-0 animate-ping rounded-full bg-sky-300 opacity-80" />
            )}
            <span className="relative inline-flex size-1.5 rounded-full bg-sky-300" />
          </span>
          11.4s
        </span>
      </div>
      <p className="text-[11px] leading-snug text-white/60">
        Multi-sample generation with provider fallback.
      </p>
    </div>
  )
}

function ArtifactVerify() {
  const candidates = [
    { score: 0.78, winner: false, tone: "from-rose-500 to-orange-500" },
    { score: 0.94, winner: true, tone: "from-emerald-400 to-sky-400" },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {candidates.map((c, i) => (
          <div
            key={i}
            className={`relative aspect-[3/4] overflow-hidden rounded-lg border ${
              c.winner ? "border-emerald-400/80" : "border-white/10"
            }`}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${c.tone} opacity-70`}
            />
            <div className="absolute inset-x-3 bottom-1 top-6 rounded bg-white/15" />
            <div className="absolute left-1/2 top-2 size-5 -translate-x-1/2 rounded-full bg-white/80" />
            <span
              className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${
                c.winner ? "bg-emerald-500" : "bg-black/60"
              }`}
            >
              {c.score.toFixed(2)}
            </span>
            {c.winner && (
              <span className="absolute bottom-1.5 right-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                ✓ PICK
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-white/60">
        CLIP identity compare → auto-retry if drift is detected.
      </p>
    </div>
  )
}

function ArtifactPolish() {
  return (
    <div className="space-y-3">
      <div className="relative h-40 overflow-hidden rounded-xl">
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative bg-slate-800">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.1),transparent_55%)]" />
            <div className="absolute inset-x-4 bottom-2 top-6 rounded bg-white/20 blur-[1.2px]" />
            <div className="absolute left-1/2 top-3 size-6 -translate-x-1/2 rounded-full bg-white/50 blur-[1px]" />
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
              RAW
            </span>
          </div>
          <div className="relative bg-gradient-to-br from-amber-400 via-rose-400 to-violet-500">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.35),transparent_55%)]" />
            <div className="absolute inset-x-4 bottom-2 top-6 rounded bg-white/40" />
            <div className="absolute left-1/2 top-3 size-6 -translate-x-1/2 rounded-full bg-white/90" />
            <span className="absolute right-2 top-2 rounded bg-white/95 px-1.5 py-0.5 text-[9px] font-bold text-slate-900">
              4K
            </span>
          </div>
        </div>
        <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-white/75">
        <Metric label="Face restore" value="GFPGAN" tone="good" />
        <Metric label="Upscale" value="ESRGAN 2x" tone="good" />
      </div>
      <p className="text-[11px] leading-snug text-white/60">
        Ready for the closet, share, or extension overlay.
      </p>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "good" | "warn"
}) {
  const toneClass =
    tone === "good" ? "text-emerald-300" : "text-amber-300"
  return (
    <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-white/45">
        {label}
      </div>
      <div className={`text-xs font-semibold ${toneClass}`}>{value}</div>
    </div>
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
