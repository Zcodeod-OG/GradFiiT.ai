"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Check, ArrowRight } from "lucide-react"
import { TiltCard } from "@/components/ui/tilt-card"
import Link from "next/link"
import { PLAN_CARDS } from "@/lib/plans"

const plans = PLAN_CARDS.map((plan) => ({
  ...plan,
  cta: plan.code === "business" ? "Contact Sales" : "Choose Plan",
}))

export function PricingSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section id="pricing" ref={ref} className="section-spacing relative">
      <div className="gradient-divider mb-24" />

      <div className="container-main">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-balance tracking-tight">
            Simple{" "}
            <span className="text-gradient">Pricing</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the perfect plan for your needs
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-8 max-w-7xl mx-auto items-start">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="relative"
            >
              {plan.featured && (
                <motion.div
                  className="absolute -top-4 left-1/2 -translate-x-1/2 z-20"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="shimmer bg-gradient-to-r from-primary to-accent px-5 py-1.5 rounded-full text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25">
                    Most Popular
                  </span>
                </motion.div>
              )}

              <TiltCard intensity={plan.featured ? 8 : 10} className="h-full">
                <motion.div
                  className={`surface-panel rounded-2xl p-8 h-full ${
                    plan.featured
                      ? "border-2 border-primary/50 shadow-lg shadow-primary/10"
                      : ""
                  }`}
                  whileHover={{ y: -8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-display text-2xl font-bold text-foreground mb-2 tracking-tight">
                        {plan.name}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {plan.description}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-foreground">{plan.priceLabel}</span>
                      <span className="text-muted-foreground">{plan.cadence}</span>
                    </div>

                    <Link href={plan.code === "business" ? "mailto:sales@alter.ai" : "/try"} className="block">
                      <Button
                        className={
                          plan.featured
                            ? "w-full pulse-glow"
                            : "w-full bg-white/70 border border-border text-foreground hover:bg-secondary"
                        }
                        size="lg"
                      >
                        {plan.cta}
                        {plan.featured && <ArrowRight className="size-4 ml-2" />}
                      </Button>
                    </Link>

                    <div className="space-y-3 pt-6">
                      {plan.features.map((feature, fIndex) => (
                        <motion.div
                          key={feature}
                          className="flex items-start gap-3"
                          initial={{ opacity: 0, x: -10 }}
                          animate={isInView ? { opacity: 1, x: 0 } : {}}
                          transition={{
                            duration: 0.3,
                            delay: 0.5 + index * 0.15 + fIndex * 0.05,
                          }}
                        >
                          <div className="size-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 shrink-0">
                            <Check className="size-3 text-primary" />
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {feature}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
