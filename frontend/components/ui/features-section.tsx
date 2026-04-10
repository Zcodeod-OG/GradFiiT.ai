"use client"

import { motion, useInView } from "framer-motion"
import { Zap, Shirt, Sparkles, Chrome, Shield, Users } from "lucide-react"
import { useRef } from "react"
import { TiltCard } from "@/components/ui/tilt-card"

const features = [
  {
    icon: Zap,
    title: "Instant Results",
    description:
      "Lightning fast AI generation delivers your virtual try-on in seconds, not minutes.",
  },
  {
    icon: Shirt,
    title: "Any Clothing",
    description:
      "Works with items from any brand. Upload any clothing image and see it on you.",
  },
  {
    icon: Sparkles,
    title: "Photorealistic",
    description:
      "Two-layer AI pipeline with OOTDiffusion and SDXL refinement for stunning realism.",
  },
  {
    icon: Chrome,
    title: "Browser Extension",
    description:
      "Try on clothes directly from any online store with our Chrome extension.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description:
      "Your photos are processed securely and never stored without your permission.",
  },
  {
    icon: Users,
    title: "All Body Types",
    description:
      "Designed to work beautifully across all body types, sizes, and proportions.",
  },
]

export function FeaturesSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section id="features" ref={ref} className="section-spacing relative">
      <div className="gradient-divider mb-24" />

      <div className="container-main">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-balance tracking-tight">
            Why Choose{" "}
            <span className="text-gradient">ALTER.ai</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Experience the future of online shopping with cutting-edge AI
            technology
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <TiltCard intensity={12} className="h-full">
                <div className="surface-panel rounded-2xl p-8 h-full relative group overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:neo-shadow">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  </div>

                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={
                      isInView ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -180 }
                    }
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                      delay: 0.3 + index * 0.1,
                    }}
                    className="size-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-6 transition-shadow duration-300 group-hover:shadow-[0_10px_24px_oklch(0.56_0.14_250/0.35)]"
                  >
                    <feature.icon className="size-7 text-primary-foreground" />
                  </motion.div>

                  <h3 className="font-display text-2xl font-bold mb-3 tracking-tight text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-[0.95rem]">
                    {feature.description}
                  </p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
