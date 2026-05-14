"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Clock, ImageDown, ShieldCheck, Sparkles } from "lucide-react"
import { AnimatedCounter } from "@/components/ui/animated-counter"

/**
 * The studios trust-row.
 *
 * Sits directly under <StudioCarousel /> on the landing page so the
 * three studios card grid is followed immediately by the proof-points
 * those studios deliver — same beat as thenewblack.ai's "Trusted by
 * 500,000+ brands" row that lives just below their studios carousel.
 *
 * Counters animate when the section enters the viewport and respect
 * prefers-reduced-motion; an infinite marquee of partner retailers
 * sits below, capped with soft fade-out gradients on either side.
 */

const STATS = [
  {
    label: "Brands & designers",
    value: 12,
    suffix: "K+",
    prefix: "",
    icon: Sparkles,
    accent: "from-emerald-500 to-teal-400",
  },
  {
    label: "Looks generated",
    value: 676,
    suffix: "+",
    prefix: "",
    icon: ImageDown,
    accent: "from-fuchsia-500 to-rose-400",
  },
  {
    label: "Avg. studio render",
    value: 12,
    suffix: "s",
    prefix: "",
    icon: Clock,
    accent: "from-sky-500 to-indigo-500",
  },
  {
    label: "Identity match (CLIP)",
    value: 93,
    suffix: "%",
    prefix: "",
    icon: ShieldCheck,
    accent: "from-amber-500 to-orange-400",
  },
]

const MARQUEE = [
  "Zara",
  "ASOS",
  "H&M",
  "Uniqlo",
  "Mango",
  "SHEIN",
  "Amazon Fashion",
  "Nordstrom",
  "Reformation",
  "Aritzia",
  "COS",
  "Net-a-Porter",
]

export function StatsTickerSection() {
  const reduce = useReducedMotion()

  return (
    <section className="relative overflow-hidden bg-white pt-2 pb-20">
      <div className="container-main">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={reduce ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
          className="mb-10 flex flex-col gap-2"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Proof, not promises
          </span>
          <h2 className="font-display max-w-2xl text-3xl font-bold tracking-tight text-balance text-foreground md:text-5xl md:leading-[1.05]">
            Trusted by{" "}
            <span className="bg-gradient-to-r from-primary via-sky-500 to-emerald-500 bg-clip-text text-transparent">
              12,000+ brands
            </span>{" "}
            and designers worldwide.
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 gap-px md:grid-cols-4 bg-border/60 border border-border/60 overflow-hidden rounded-3xl">
          {STATS.map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.55, ease: "easeOut" }
              }
              className="relative overflow-hidden bg-white p-7"
            >
              <div
                className={`absolute -right-8 -top-8 size-24 rounded-full bg-gradient-to-br opacity-10 blur-2xl ${stat.accent}`}
              />
              <stat.icon className="size-4 text-muted-foreground" />
              <p className="mt-6 font-display text-5xl font-bold tracking-tight text-foreground md:text-6xl">
                <AnimatedCounter
                  to={stat.value}
                  suffix={stat.suffix}
                  duration={reduce ? 0 : 2.0}
                />
              </p>
              <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="relative mt-16 border-y border-border/60 bg-slate-50/70 py-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-slate-50 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-slate-50 to-transparent" />
        <div className="overflow-hidden">
          <motion.div
            className="flex gap-12 whitespace-nowrap text-sm font-medium uppercase tracking-[0.24em] text-slate-500"
            animate={reduce ? undefined : { x: ["0%", "-50%"] }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 32, ease: "linear", repeat: Infinity }
            }
          >
            {[...MARQUEE, ...MARQUEE].map((label, idx) => (
              <span
                key={`${label}-${idx}`}
                className="inline-flex items-center gap-3"
              >
                <span className="size-1.5 rounded-full bg-slate-300" />
                {label}
              </span>
            ))}
          </motion.div>
        </div>
        <p className="mt-4 text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Works on most major fashion retailers
        </p>
      </div>
    </section>
  )
}
