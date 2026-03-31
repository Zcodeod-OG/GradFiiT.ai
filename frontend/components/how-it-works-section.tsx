"use client"

import { useRef } from "react"
import { motion, useInView, useScroll, useTransform, type MotionValue } from "framer-motion"
import { Upload, Wand2, Download } from "lucide-react"

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Upload Your Photo",
    description:
      "Take or upload a photo of yourself. Our AI works with any standard photo.",
  },
  {
    icon: Wand2,
    step: "02",
    title: "Choose Clothing",
    description:
      "Select any clothing item from our catalog or upload your own garment image.",
  },
  {
    icon: Download,
    step: "03",
    title: "Get Your Result",
    description:
      "Receive photorealistic images showing how the clothing looks on you — in seconds.",
  },
]

function StepCard({
  item,
  index,
  isInView,
  scrollYProgress,
}: {
  item: (typeof steps)[0]
  index: number
  isInView: boolean
  scrollYProgress: MotionValue<number>
}) {
  const stepProgress = useTransform(
    scrollYProgress,
    [index * 0.3, index * 0.3 + 0.3],
    [0, 1]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.2 }}
      className="relative"
    >
      <div className="text-center space-y-6">
        <div className="relative inline-block">
          {/* Glow ring that activates with scroll */}
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{
              opacity: stepProgress,
              boxShadow:
                "0 0 30px oklch(0.65 0.25 275 / 0.4), 0 0 60px oklch(0.65 0.25 275 / 0.15)",
              scale: 1.1,
            }}
          />
          <motion.div
            className="size-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto relative z-10"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <item.icon className="size-10 text-primary-foreground" />
          </motion.div>
          {/* Step number badge */}
          <motion.div
            className="absolute -top-2 -right-2 size-8 rounded-full bg-background border-2 border-primary flex items-center justify-center z-20"
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : { scale: 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 12,
              delay: 0.5 + index * 0.2,
            }}
          >
            <span className="text-xs font-bold text-primary">
              {item.step}
            </span>
          </motion.div>
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl font-bold text-foreground">
            {item.title}
          </h3>
          <p className="text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: "-80px" })

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.8", "end 0.6"],
  })
  const lineScaleX = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="py-24 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-background via-purple-900/5 to-background" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-balance">
            How It{" "}
            <span className="text-gradient">Works</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Three simple steps to see yourself in any outfit
          </p>
        </motion.div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Animated connection line that fills with scroll */}
            <div className="hidden md:block absolute top-[60px] left-[16%] right-[16%] h-[2px]">
              {/* Background track */}
              <div className="absolute inset-0 bg-border/30 rounded-full" />
              {/* Animated fill */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary rounded-full"
                style={{ scaleX: lineScaleX, transformOrigin: "left" }}
              />
            </div>

            {steps.map((item, index) => (
              <StepCard
                key={item.title}
                item={item}
                index={index}
                isInView={isInView}
                scrollYProgress={scrollYProgress}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
