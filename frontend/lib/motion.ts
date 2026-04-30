/**
 * GradFiT motion library.
 *
 * Centralised Framer Motion variants so every studio shares the same
 * timing/easing curves. The reference UX (thenewblack.ai) leans on:
 *
 * - long-tail "spring" entrances (~0.6-0.9s)
 * - staggered child reveals on hero copy + studio cards
 * - subtle parallax on hero imagery
 * - cross-dissolve between studio canvas states
 *
 * Keep this file framework-only; components import the variants and
 * apply them via `motion.div variants={...}`. Easing values mirror the
 * Apple-style `easeOutExpo` curve so motion feels weighty without being
 * sluggish.
 */

import type { Transition, Variants } from "framer-motion";

/** Apple-style "ease out expo" — heavy, decelerates fast at the end. */
export const EASE_OUT_EXPO: Transition["ease"] = [0.16, 1, 0.3, 1];

/** A snappier curve we use for hover micro-interactions. */
export const EASE_QUICK: Transition["ease"] = [0.32, 0.72, 0, 1];

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -32 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.55, ease: EASE_OUT_EXPO },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 32 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.55, ease: EASE_OUT_EXPO },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: EASE_OUT_EXPO },
  },
};

/**
 * Stagger container — apply to a parent element and let children inherit
 * `fadeUp` (or any of the variants above). The default delay matches the
 * thenewblack hero rhythm.
 */
export const staggerContainer = (delayChildren = 0.1, stagger = 0.08): Variants => ({
  hidden: {},
  show: {
    transition: {
      delayChildren,
      staggerChildren: stagger,
    },
  },
});

/** Hero parallax — couple this with `useScroll` / `useTransform`. */
export const heroParallax: Variants = {
  hidden: { opacity: 0, scale: 1.04 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 1.2, ease: EASE_OUT_EXPO },
  },
};

/** Studio card morph — hover lifts and gently saturates. */
export const studioCard: Variants = {
  rest: { y: 0, scale: 1, boxShadow: "0 18px 44px -28px rgba(13, 18, 30, 0.35)" },
  hover: {
    y: -6,
    scale: 1.015,
    boxShadow: "0 28px 64px -28px rgba(13, 18, 30, 0.45)",
    transition: { duration: 0.4, ease: EASE_QUICK },
  },
};

/** Cross-dissolve between studio states (e.g. blank canvas -> result). */
export const crossDissolve: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
  exit: { opacity: 0, transition: { duration: 0.25, ease: EASE_OUT_EXPO } },
};

/** Sticky rail item — used by the left-rail nav. */
export const railItem: Variants = {
  rest: { x: 0 },
  hover: { x: 6, transition: { duration: 0.25, ease: EASE_QUICK } },
};
