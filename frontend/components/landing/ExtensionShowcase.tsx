"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  Chrome,
  ShoppingBag,
  ArrowRight,
  Layers,
  Wand2,
  ImagePlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Marketing surface for the GradFiT Chrome extension.
 *
 * Shows a stylized "browser frame" with a fake product page (the kind of
 * page the extension targets) and overlays our floating "Try with my photo"
 * button + inline progress drawer that the extension injects. The right rail
 * lists the primary capabilities and links to the install path.
 */
export function ExtensionShowcase() {
  const reduce = useReducedMotion()

  return (
    <section
      id="extension"
      className="relative overflow-hidden border-y border-border/60 bg-gradient-to-br from-white via-slate-50 to-white py-24"
    >
      <div className="container-main grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={
            reduce ? { duration: 0 } : { duration: 0.7, ease: "easeOut" }
          }
          className="relative"
        >
          <BrowserMock reduce={!!reduce} />
        </motion.div>

        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Chrome className="size-3.5" />
            Chrome Extension
          </span>
          <h2 className="mt-4 font-display text-4xl md:text-5xl tracking-tight text-balance">
            Try anything on{" "}
            <span className="text-gradient">while you shop.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            One click on any product page on Zara, ASOS, H&amp;M, Amazon Fashion
            and more. We pull the garment, run the same identity-locked pipeline
            you use on the web app, and stream progress right inside the page.
          </p>

          <ul className="mt-6 space-y-3 text-sm">
            <FeatureRow
              icon={ImagePlus}
              title="Floating &quot;Try with my photo&quot; button"
              body="Appears next to the buy button on supported retailers. Uses your saved photo automatically."
            />
            <FeatureRow
              icon={Wand2}
              title="In-page progress drawer"
              body="Same PipelineMeter as the web app, mounted in a shadow DOM so it never clashes with the site."
            />
            <FeatureRow
              icon={Layers}
              title="Synced closet"
              body="Saved try-ons from the extension show up in your dashboard runway feed instantly."
            />
          </ul>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/try">
              <Button className="h-11 px-6">
                Open the studio <ArrowRight className="size-4" />
              </Button>
            </Link>
            <a
              href="https://chromewebstore.google.com/"
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" className="h-11 px-6 bg-white/70">
                <Chrome className="size-4" /> Add to Chrome
              </Button>
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Manifest V3 - shadow DOM isolated - works on most major retailers.
          </p>
        </div>
      </div>
    </section>
  )
}

function FeatureRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Chrome
  title: string
  body: string
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/70 bg-white/70 p-3">
      <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-sky-500/15 text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
    </li>
  )
}

function BrowserMock({ reduce }: { reduce: boolean }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className="size-3 rounded-full bg-rose-400" />
        <span className="size-3 rounded-full bg-amber-400" />
        <span className="size-3 rounded-full bg-emerald-400" />
        <div className="ml-3 flex-1 truncate rounded-md bg-slate-100 px-3 py-1 text-xs text-slate-500">
          shop.example.com / dresses / silk-midi
        </div>
        <Chrome className="size-4 text-slate-400" />
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_1fr]">
        <div className="aspect-[4/5] rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100">
          <div className="flex h-full items-end p-4">
            <div className="rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-700 backdrop-blur">
              <ShoppingBag className="mr-1 inline size-3.5 text-slate-500" />
              Silk Midi Dress - $148
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="h-4 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-5/6 rounded bg-slate-100" />
          <div className="h-3 w-2/3 rounded bg-slate-100" />

          <div className="mt-4 flex items-center gap-2">
            <div className="h-9 flex-1 rounded-lg bg-slate-900 text-center text-sm leading-9 text-white">
              Add to bag
            </div>
            <motion.div
              initial={{ scale: 0.96, opacity: 0.9 }}
              animate={
                reduce
                  ? undefined
                  : { scale: [0.96, 1.02, 0.96], opacity: [0.92, 1, 0.92] }
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
              }
              className="h-9 rounded-lg bg-gradient-to-r from-primary via-sky-500 to-emerald-400 px-3 text-sm font-semibold leading-9 text-white shadow-lg"
            >
              Try with my photo
            </motion.div>
          </div>

          <div className="mt-3 rounded-xl border border-border/70 bg-white/80 p-3 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold">Try-on in progress</span>
              <span className="tabular-nums">73%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <motion.div
                className="h-full bg-gradient-to-r from-primary via-sky-500 to-emerald-400"
                initial={{ width: "20%" }}
                animate={reduce ? undefined : { width: ["20%", "73%", "92%", "73%"] }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: 4, repeat: Infinity, ease: "easeInOut" }
                }
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Identity check &middot; face restore &middot; upscale
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
