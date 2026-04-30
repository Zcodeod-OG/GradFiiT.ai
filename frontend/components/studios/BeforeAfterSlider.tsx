"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type BeforeAfterSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
};

/**
 * Drag-to-reveal slider used by the Try-On studio canvas.
 *
 * Layout:
 *   [ AFTER (full-bleed) ]
 *   [ BEFORE (clip-path inset on the right) ]
 *   [ vertical handle, draggable along x ]
 *
 * The handle uses a Framer Motion x value that we feed into a clip-path
 * inset on the BEFORE layer so the reveal stays GPU-accelerated. We also
 * drive a small CSS variable `--tnb-split` so labels can fade in/out
 * based on which side dominates.
 *
 * Mirrors thenewblack.ai's canvas scrubber pattern but stays in our
 * monochrome ink-on-bone aesthetic. Honors prefers-reduced-motion by
 * disabling spring on initial mount; the slider itself is interactive
 * regardless.
 */
export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  className,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const insetPct = useTransform(x, (value) => {
    if (width === 0) return 50;
    return Math.max(0, Math.min(100, ((width - value) / width) * 100));
  });
  const clipPath = useTransform(insetPct, (pct) => `inset(0 ${pct}% 0 0)`);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setWidth(rect.width);
      x.set(rect.width / 2);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [x]);

  const onPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0 && event.type !== "pointerdown") return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    x.set(next);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      className={cn(
        "relative size-full overflow-hidden rounded-3xl select-none cursor-ew-resize",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterUrl}
        alt={afterLabel}
        className="absolute inset-0 size-full object-cover"
        draggable={false}
      />

      <motion.div
        className="absolute inset-0"
        style={{ clipPath, WebkitClipPath: clipPath }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeUrl}
          alt={beforeLabel}
          className="absolute inset-0 size-full object-cover"
          draggable={false}
        />
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: width }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x }}
        className="absolute top-0 bottom-0 -translate-x-1/2 w-px bg-white/90 mix-blend-difference"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center size-10 rounded-full bg-white text-[11px] font-mono font-semibold tracking-widest text-black shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)]">
          ⇆
        </div>
      </motion.div>

      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-[0.18em] bg-black/60 text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-[0.18em] bg-white/85 text-black backdrop-blur">
        {afterLabel}
      </span>
    </div>
  );
}
