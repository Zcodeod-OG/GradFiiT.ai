"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { ExternalLink, Sparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MouseEvent, WheelEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  garmentsApi,
  type Garment,
  type GarmentSuggestion,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type GarmentDetailModalProps = {
  garment: Garment | null;
  onClose: () => void;
  // Optional: when the user picks a suggestion, we swap content in place
  // without remounting the modal. The parent doesn't have to do anything.
};

const TYPE_LABEL: Record<string, string> = {
  upper_body: "Top",
  lower_body: "Bottom",
  full_body: "Full body",
  outerwear: "Outerwear",
  accessory: "Accessory",
};

/** Soft animated gradient drawn from the garment palette. */
function PaletteBackdrop({ palette }: { palette: Garment["color_palette"] }) {
  const colors = (palette ?? []).slice(0, 3).map((p) => p.hex);
  if (colors.length === 0) {
    return (
      <div className="absolute inset-0 bg-[radial-gradient(900px_540px_at_30%_20%,rgba(124,58,237,0.18),transparent_60%),radial-gradient(800px_500px_at_80%_80%,rgba(14,165,233,0.16),transparent_60%)]" />
    );
  }
  const [a, b = a, c = b] = colors;
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(1100px 600px at 25% 18%, ${a}55, transparent 60%), radial-gradient(900px 540px at 78% 82%, ${b}40, transparent 60%), radial-gradient(700px 520px at 50% 50%, ${c}30, transparent 70%)`,
        }}
      />
      <div className="absolute inset-0 backdrop-blur-[40px]" />
      <div className="absolute inset-0 bg-slate-950/55" />
    </div>
  );
}

function TiltedHero({
  garment,
  reduce,
}: {
  garment: Garment;
  reduce: boolean;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-10, 10]), {
    stiffness: 140,
    damping: 16,
  });
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), {
    stiffness: 140,
    damping: 16,
  });

  // Zoom: scroll wheel inside the hero scales 1× → 2.5×. Reset when the
  // garment changes — done at render time (the documented React 19
  // pattern) rather than inside an effect so we don't trigger
  // react-hooks/set-state-in-effect.
  const [zoom, setZoom] = useState(1);
  const [zoomForGarmentId, setZoomForGarmentId] = useState(garment.id);
  if (zoomForGarmentId !== garment.id) {
    setZoomForGarmentId(garment.id);
    setZoom(1);
  }

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - r.left) / r.width - 0.5);
    mouseY.set((e.clientY - r.top) / r.height - 0.5);
  };

  const handleLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setZoom((prev) => {
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      return Math.max(1, Math.min(2.5, prev + delta));
    });
  };

  const thumb = garment.extracted_image_url || garment.image_url;

  return (
    <div
      role="presentation"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onWheel={handleWheel}
      className="relative isolate flex h-full w-full items-center justify-center"
      style={{ perspective: 1200 }}
    >
      <motion.div
        className="relative aspect-[3/4] w-full max-w-md select-none"
        style={
          reduce
            ? undefined
            : {
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
              }
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt={garment.name}
          draggable={false}
          className="size-full object-contain drop-shadow-[0_40px_60px_rgba(0,0,0,0.55)] transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
        />
      </motion.div>

      {/* Zoom hint / control */}
      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-white/80 backdrop-blur">
        {zoom > 1 ? <ZoomIn className="size-3" /> : <ZoomOut className="size-3" />}
        {zoom.toFixed(2)}×
      </div>
    </div>
  );
}

export function GarmentDetailModal({
  garment: incomingGarment,
  onClose,
}: GarmentDetailModalProps) {
  const router = useRouter();
  const reduce = !!useReducedMotion();
  // Local "current" so a suggestion click can swap content without
  // remounting and without forcing the parent to re-route.
  const [garment, setGarment] = useState<Garment | null>(incomingGarment);
  const [suggestions, setSuggestions] = useState<GarmentSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    setGarment(incomingGarment);
  }, [incomingGarment]);

  useEffect(() => {
    if (!garment) return;
    let cancelled = false;
    setLoadingSuggestions(true);
    garmentsApi
      .suggestions(garment.id, 6)
      .then((res) => {
        if (!cancelled) setSuggestions(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [garment]);

  // Close on Escape, lock body scroll while open.
  useEffect(() => {
    if (!garment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [garment, onClose]);

  const handleTry = () => {
    if (!garment) return;
    onClose();
    router.push(`/try?garmentId=${garment.id}`);
  };

  const palette = garment?.color_palette ?? [];

  return (
    <AnimatePresence>
      {garment ? (
        <motion.div
          key={garment.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-stretch justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Detail view for ${garment.name}`}
        >
          <button
            type="button"
            aria-label="Close detail"
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 28 }}
            className="relative z-10 m-0 flex w-full max-w-6xl flex-col overflow-hidden bg-slate-950 text-white shadow-[0_60px_200px_-40px_rgba(0,0,0,0.6)] sm:m-6 sm:rounded-3xl"
          >
            <PaletteBackdrop palette={palette} />

            <div className="relative z-10 flex h-full flex-col lg:flex-row">
              <div className="relative aspect-[3/4] w-full lg:aspect-auto lg:w-7/12">
                <TiltedHero garment={garment} reduce={reduce} />
              </div>

              <div className="relative flex w-full flex-col gap-5 p-6 lg:w-5/12 lg:p-8">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-2">
                    {garment.garment_type ? (
                      <Badge variant="outline" className="self-start text-[10px] uppercase tracking-[0.22em] text-white/80 border-white/20">
                        {TYPE_LABEL[garment.garment_type] ?? garment.garment_type}
                      </Badge>
                    ) : null}
                    <h2 className="font-display text-2xl leading-tight text-white sm:text-3xl">
                      {garment.name}
                    </h2>
                    {garment.category ? (
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                        {garment.category}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                {garment.description ? (
                  <p className="text-sm leading-relaxed text-white/75">
                    {garment.description}
                  </p>
                ) : null}

                {palette.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-white/55">
                      Palette
                    </span>
                    <div className="flex items-center gap-1.5">
                      {palette.map((p, i) => (
                        <span
                          key={`${p.hex}-${i}`}
                          title={p.hex}
                          className="block size-7 rounded-full ring-1 ring-white/15"
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={handleTry}
                    className="rounded-full bg-white text-slate-950 hover:bg-white/90"
                  >
                    <Sparkles className="size-4" />
                    Try it on
                  </Button>
                  {garment.source_url ? (
                    <Button
                      type="button"
                      variant="ghost"
                      asChild
                      className="rounded-full text-white/80 hover:bg-white/10 hover:text-white"
                    >
                      <a
                        href={garment.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-4" />
                        Source
                      </a>
                    </Button>
                  ) : null}
                </div>

                <div className="mt-auto flex flex-col gap-3 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-white/55">
                      Pairs well with
                    </span>
                    {loadingSuggestions ? (
                      <span className="text-[10px] text-white/40">Loading…</span>
                    ) : null}
                  </div>
                  <SuggestionsRail
                    suggestions={suggestions}
                    onPick={(g) => setGarment(g)}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SuggestionsRail({
  suggestions,
  onPick,
}: {
  suggestions: GarmentSuggestion[];
  onPick: (g: Garment) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <p className="text-xs text-white/45">
        Add a few more pieces to your closet and we&apos;ll suggest pairings.
      </p>
    );
  }
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
      {suggestions.map((s) => {
        const thumb = s.extracted_image_url || s.image_url;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              "group/sug relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors hover:border-white/30"
            )}
            aria-label={`Switch detail to ${s.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt={s.name}
              className="size-full object-contain p-1.5"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-white opacity-0 group-hover/sug:opacity-100">
              {s.reason}
            </span>
          </button>
        );
      })}
    </div>
  );
}
