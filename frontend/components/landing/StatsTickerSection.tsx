"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Clock, ImageDown, ShieldCheck, Sparkles } from "lucide-react"
import { AnimatedCounter } from "@/components/ui/animated-counter"

/**
 * Big trust-row of headline stats + an infinite marquee of partner /
 * retailer logos. The numbers count up when the section enters the
 * viewport; counters and marquee both honor prefers-reduced-motion.
 */

const STATS = [
  {
    label: "Avg. generation time",
    value: 11,
    suffix: "s",
    icon: Clock,
    accent: "from-emerald-500 to-teal-400",
  },
  {
    label: "Identity match (CLIP)",
    value: 93,
    suffix: "%",
    icon: ShieldCheck,
    accent: "from-sky-500 to-indigo-500",
  },
  {
    label: "Looks generated",
    value: 12000,
    suffix: "+",
    icon: ImageDown,
    accent: "from-fuchsia-500 to-rose-400",
  },
  {
    label: "Output resolution",
    value: 4,
    suffix: "K",
    icon: Sparkles,
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
    <section className="relative overflow-hidden bg-white py-20">
      <div className="container-main">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {STATS.map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }
              }
              className="relative overflow-hidden rounded-2xl border border-border/70 bg-white p-5 shadow-sm"
            >
              <div
                className={`absolute -right-6 -top-6 size-20 rounded-full bg-gradient-to-br opacity-15 blur-2xl ${stat.accent}`}
              />
              <span
                className={`inline-flex size-9 items-center justify-center rounded-lg bg-gradient-to-br text-white ${stat.accent}`}
              >
                <stat.icon className="size-4" />
              </span>
              <p className="mt-3 font-display text-3xl md:text-4xl tracking-tight">
                <AnimatedCounter
                  to={stat.value}
                  suffix={stat.suffix}
                  duration={reduce ? 0 : 2.0}
                />
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
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
