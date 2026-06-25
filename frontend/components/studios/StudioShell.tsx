"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

import { fadeUp, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

type StudioShellProps = {
  /** Short label like "Studio 01" — split into number + label internally. */
  eyebrow?: string;
  /** Numeral shown massive next to the title, e.g. "01". Falls back to
   *  parsing the trailing digits from `eyebrow`. */
  numeral?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

const NUMERAL_REGEX = /(\d+)\s*$/;

/**
 * StudioShell wraps every studio page so the hero copy, layout grid,
 * and entry animations stay consistent. Pages provide their own
 * canvas + sidebar via children.
 *
 * The eyebrow now mirrors thenewblack's "STUDIO 01 / AI FASHION DESIGN"
 * slug pattern: tracked-out uppercase eyebrow + a giant mono numeral
 * pinned next to the headline. Numeral + title carry shared
 * `layoutId`s so the StudiosTransition wrapper can morph them between
 * studio routes.
 */
export function StudioShell({
  eyebrow,
  numeral,
  title,
  description,
  actions,
  children,
  className,
}: StudioShellProps) {
  const resolvedNumeral =
    numeral ?? (eyebrow ? NUMERAL_REGEX.exec(eyebrow)?.[1] ?? null : null);

  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={staggerContainer(0.05, 0.06)}
      className={cn(
        "flex flex-col gap-8 lg:gap-10 px-4 sm:px-6 lg:px-12 py-6 sm:py-10 lg:py-14 max-w-[1480px] mx-auto w-full",
        className
      )}
    >
      <motion.header
        variants={fadeUp}
        className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="flex items-end gap-5 lg:gap-7">
          {resolvedNumeral ? (
            <motion.span
              layoutId="studio-marker-numeral"
              className="tnb-numeral text-[5rem] lg:text-[7rem] leading-none -mb-2"
            >
              {resolvedNumeral}
            </motion.span>
          ) : null}

          <div className="flex flex-col gap-2 max-w-2xl">
            {eyebrow ? (
              <motion.span
                layoutId="studio-marker-eyebrow"
                className="tnb-eyebrow"
              >
                {eyebrow}
              </motion.span>
            ) : null}
            <motion.h1
              layoutId="studio-marker-title"
              className="tnb-headline text-3xl lg:text-5xl"
            >
              {title}
            </motion.h1>
            {description ? (
              <p className="text-base text-muted-foreground max-w-xl">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex flex-wrap gap-2 lg:static sticky top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur-md border-b border-border/40 lg:mx-0 lg:px-0 lg:py-0 lg:bg-transparent lg:backdrop-blur-none lg:border-0">
            {actions}
          </div>
        ) : null}
      </motion.header>

      <div className="tnb-rule">
        <span className="text-[10px] font-mono tracking-[0.32em] uppercase">
          Workspace
        </span>
      </div>

      <motion.div variants={fadeUp}>{children}</motion.div>
    </motion.section>
  );
}
