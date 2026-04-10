"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import ReactCompareImage from "react-compare-image"
import { Upload, Wand2, Shirt, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

function svgDataUri(svg: string) {
  // Encode a minimal SVG into a data URI (no extra assets required)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const BEFORE_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650" viewBox="0 0 900 650">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1f2937" />
      <stop offset="1" stop-color="#111827" />
    </linearGradient>
  </defs>
  <rect width="900" height="650" fill="url(#bg)"/>
  <rect x="80" y="80" width="740" height="490" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <circle cx="450" cy="260" r="86" fill="rgba(255,255,255,0.10)"/>
  <rect x="328" y="356" width="244" height="170" rx="46" fill="rgba(255,255,255,0.08)"/>
  <text x="450" y="120" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="28" fill="rgba(255,255,255,0.85)">Before</text>
  <text x="450" y="610" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="18" fill="rgba(255,255,255,0.60)">Upload a photo</text>
</svg>
`)

const AFTER_SVG = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650" viewBox="0 0 900 650">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5" />
      <stop offset="1" stop-color="#06b6d4" />
    </linearGradient>
  </defs>
  <rect width="900" height="650" fill="url(#bg)"/>
  <rect x="80" y="80" width="740" height="490" rx="28" fill="rgba(0,0,0,0.18)" stroke="rgba(255,255,255,0.22)"/>
  <circle cx="450" cy="260" r="86" fill="rgba(0,0,0,0.22)"/>
  <rect x="320" y="340" width="260" height="210" rx="56" fill="rgba(0,0,0,0.22)"/>
  <path d="M330 390 C365 352, 410 332, 450 332 C490 332, 535 352, 570 390" stroke="rgba(255,255,255,0.55)" stroke-width="10" fill="none" stroke-linecap="round"/>
  <text x="450" y="120" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="28" fill="rgba(255,255,255,0.92)">After</text>
  <text x="450" y="610" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="18" fill="rgba(255,255,255,0.72)">Try-on preview</text>
</svg>
`)

type Step = {
  title: string
  description: string
  icon: React.ComponentType<React.ComponentProps<"svg"> & { className?: string }>
}

const STEPS: Step[] = [
  {
    title: "Upload",
    description: "Add your photo + a garment image.",
    icon: Upload,
  },
  {
    title: "Process",
    description: "Background removal + fit alignment.",
    icon: Wand2,
  },
  {
    title: "Try-On",
    description: "Instant before/after preview.",
    icon: Shirt,
  },
]

export function DemoSection() {
  const [activeStep, setActiveStep] = React.useState(0)

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setActiveStep((s) => (s + 1) % STEPS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [])

  const progress = ((activeStep + 1) / STEPS.length) * 100
  const current = STEPS[activeStep]

  return (
    <section id="demo" className="section-spacing relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
      <div className="container-main relative">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground tracking-tight">
            See It In Action
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Upload → process → preview. A fast, interactive try-on experience
            designed for conversion.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          {/* Animated demo / video placeholder */}
          <Card className="overflow-hidden bg-white/85 border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Animated Demo</span>
                <div className="text-xs text-muted-foreground">
                  Live preview simulation
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative rounded-xl border bg-white/80 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-accent/10 to-transparent" />

                {/* “player” chrome */}
                <div className="relative flex items-center justify-between px-4 py-3 border-b bg-white/70 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 rounded-full bg-destructive/70" />
                    <div className="size-2.5 rounded-full bg-amber-400/70" />
                    <div className="size-2.5 rounded-full bg-emerald-400/70" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Try-on pipeline
                  </div>
                </div>

                <div className="relative p-6">
                  <Progress value={progress} />

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {STEPS.map((s, idx) => {
                      const Icon = s.icon
                      const isActive = idx === activeStep
                      return (
                        <motion.div
                          key={s.title}
                          className={[
                            "rounded-lg border p-3 bg-background/50",
                            isActive
                              ? "border-primary/40 shadow-sm"
                              : "border-border/60 opacity-70",
                          ].join(" ")}
                          animate={{
                            y: isActive ? -4 : 0,
                            opacity: isActive ? 1 : 0.7,
                          }}
                          transition={{ duration: 0.35 }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="size-8 rounded-md bg-primary/15 flex items-center justify-center">
                              <Icon className="size-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {s.title}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {s.description}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>

                  <div className="mt-6 rounded-lg border bg-white/70 p-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={current.title}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-start gap-3"
                      >
                        <div className="size-10 rounded-lg bg-gradient-to-br from-primary/25 to-accent/20 flex items-center justify-center border">
                          <current.icon className="size-5 text-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-foreground">
                            {current.title}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {current.description}
                          </div>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground mt-1" />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Before/After slider */}
          <Card className="overflow-hidden bg-white/85 border-border/80">
            <CardHeader>
              <CardTitle>Before / After</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border overflow-hidden bg-white/80">
                <ReactCompareImage
                  leftImage={BEFORE_SVG}
                  rightImage={AFTER_SVG}
                  leftImageLabel="Before"
                  rightImageLabel="After"
                  sliderLineColor="rgba(255,255,255,0.65)"
                  sliderLineWidth={2}
                  handleSize={44}
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Drag the slider to compare the original photo with the generated
                try-on result.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mt-10 flex justify-center"
        >
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-6">
            Try It Now
          </Button>
        </motion.div>
      </div>
    </section>
  )
}


