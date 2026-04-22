"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { GripVertical } from "lucide-react"

type OutfitRevealSliderProps = {
  /** The "after" image -- the completed try-on. Rendered full-bleed on the base layer. */
  afterImage: string
  /**
   * The "before" image -- typically the user's original photo. Rendered on top
   * and clipped by the slider position, so dragging from right → left wipes
   * the outfit change onto a single canvas.
   *
   * If omitted, the slider degrades to just the after image with no drag
   * affordance (but still fits the layout, avoiding empty state).
   */
  beforeImage?: string | null
  /** Accent color for the handle / divider line. */
  accentColor?: string
  /** Initial position of the reveal line as a 0-100 percentage from the left. */
  initialPosition?: number
  className?: string
}

/**
 * Single-canvas outfit reveal slider.
 *
 * Unlike a classic before/after compare (which shows two pictures side-by-
 * side), this renders **one** subject. We stack the two images on the exact
 * same canvas and clip the top (before) layer via `clip-path: inset()`. As
 * the user drags, the outfit swap appears to happen in place -- same pose,
 * same background, clothes change -- which is the UX the product is actually
 * selling.
 *
 * We intentionally avoid `react-compare-image` because it treats the two
 * halves as separate frames (one left, one right), which is the opposite of
 * what we want.
 */
export function OutfitRevealSlider({
  afterImage,
  beforeImage,
  accentColor = "rgb(139, 92, 246)",
  initialPosition = 55,
  className = "",
}: OutfitRevealSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(initialPosition)
  const [isDragging, setIsDragging] = useState(false)
  const [hasOverlay, setHasOverlay] = useState<boolean>(Boolean(beforeImage))

  // Keep position within [0, 100] whenever we receive a new image pair.
  useEffect(() => {
    setHasOverlay(Boolean(beforeImage))
  }, [beforeImage])

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.max(0, Math.min(100, pct)))
  }, [])

  // Global mouse + touch move/up handlers. We attach them at the window
  // level so the drag keeps tracking even when the cursor leaves the slider.
  useEffect(() => {
    if (!isDragging) return
    const onMouseMove = (e: MouseEvent) => updateFromClientX(e.clientX)
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) updateFromClientX(e.touches[0].clientX)
    }
    const stop = () => setIsDragging(false)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", stop)
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    window.addEventListener("touchend", stop)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", stop)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", stop)
    }
  }, [isDragging, updateFromClientX])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setPosition((p) => Math.max(0, p - 4))
    else if (e.key === "ArrowRight") setPosition((p) => Math.min(100, p + 4))
    else if (e.key === "Home") setPosition(0)
    else if (e.key === "End") setPosition(100)
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none ${className}`}
      onMouseDown={(e) => {
        if (!hasOverlay) return
        setIsDragging(true)
        updateFromClientX(e.clientX)
      }}
      onTouchStart={(e) => {
        if (!hasOverlay) return
        setIsDragging(true)
        if (e.touches[0]) updateFromClientX(e.touches[0].clientX)
      }}
    >
      {/* Base layer: the completed try-on. Always visible. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterImage}
        alt="Try-on result"
        className="absolute inset-0 w-full h-full object-contain bg-muted/10"
        draggable={false}
      />

      {/* Overlay layer: the original person photo. Clipped to the slider
          position so dragging "peels" it back to reveal the outfit change. */}
      {hasOverlay && beforeImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeImage}
            alt="Original photo"
            className="absolute inset-0 w-full h-full object-contain bg-muted/10 pointer-events-none"
            draggable={false}
            onError={() => setHasOverlay(false)}
            style={{
              clipPath: `inset(0 ${100 - position}% 0 0)`,
              WebkitClipPath: `inset(0 ${100 - position}% 0 0)`,
              transition: isDragging ? "none" : "clip-path 120ms ease-out",
            }}
          />

          {/* Divider line + draggable handle. */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${position}%`,
              width: 2,
              marginLeft: -1,
              backgroundColor: accentColor,
              boxShadow: "0 0 18px rgba(139, 92, 246, 0.55)",
              transition: isDragging ? "none" : "left 120ms ease-out",
            }}
          >
            <motion.button
              type="button"
              aria-label="Drag to reveal outfit"
              role="slider"
              aria-valuenow={Math.round(position)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onKeyDown={onKeyDown}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              onMouseDown={(e) => {
                e.stopPropagation()
                setIsDragging(true)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
                setIsDragging(true)
              }}
              className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white shadow-lg ring-2 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-4"
              style={{
                width: 44,
                height: 44,
                boxShadow:
                  "0 6px 22px rgba(15, 23, 42, 0.22), 0 0 0 2px rgba(255,255,255,0.9)",
                // Tailwind's ring color token can't be customized at runtime
                // so we lean on an inline shadow to match the accent.
                outline: `2px solid ${accentColor}`,
                outlineOffset: 2,
              }}
            >
              <GripVertical className="size-4 text-foreground/70" />
            </motion.button>
          </div>

          {/* Floating labels on each side of the divider so the user
              understands which half is which without a legend. */}
          <span
            className="absolute top-3 left-3 rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80 backdrop-blur pointer-events-none"
            style={{ opacity: position > 12 ? 1 : 0, transition: "opacity 180ms" }}
          >
            Before
          </span>
          <span
            className="absolute top-3 right-3 rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80 backdrop-blur pointer-events-none"
            style={{ opacity: position < 88 ? 1 : 0, transition: "opacity 180ms" }}
          >
            After
          </span>
        </>
      ) : null}
    </div>
  )
}
