"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { EASE_OUT_EXPO } from "@/lib/motion";

/**
 * Route-level transition for /studios/* pages.
 *
 * Wraps the studio shell content in an AnimatePresence keyed on
 * pathname, so navigating between Try-On / Design / Stylist produces
 * the morphing crossfade thenewblack.ai uses when you click between
 * "STUDIO 01" and "STUDIO 02".
 *
 * The MotionConfig wrap also enables shared-element layout animations:
 * any motion.* element inside that declares `layoutId="studio-marker"`
 * (used on the studio number / title block) will morph from the old
 * position to the new one across routes. mode="popLayout" keeps the
 * outgoing element in flow long enough for the morph to land.
 */
export function StudiosTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <MotionConfig transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
          className="will-change-transform"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
