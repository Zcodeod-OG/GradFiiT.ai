"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Shirt, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";

import { fadeUp, staggerContainer, studioCard } from "@/lib/motion";

type Studio = {
  index: string;
  title: string;
  href: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  preview: string;
};

const STUDIOS: Studio[] = [
  {
    index: "01",
    title: "Try-On",
    href: "/studios/tryon",
    blurb:
      "Upload one photo. Drop any garment from any store on the internet. Wear it before you buy.",
    icon: Shirt,
    accent: "from-[#4F7CFF] via-[#0EA5E9] to-[#34D399]",
    preview:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
  },
  {
    index: "02",
    title: "Design",
    href: "/studios/design",
    blurb:
      "Sketch a silhouette, write a vibe, attach a reference. FLUX returns a finished, photo-real piece in seconds.",
    icon: Wand2,
    accent: "from-[#A855F7] via-[#EC4899] to-[#F97316]",
    preview:
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80",
  },
  {
    index: "03",
    title: "Stylist",
    href: "/studios/stylist",
    blurb:
      "Generate full looks on consistent AI models. Book editorials, build lookbooks, never burn another shoot day.",
    icon: Sparkles,
    accent: "from-[#0EA5E9] via-[#1d4ed8] to-[#0f172a]",
    preview:
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=900&q=80",
  },
];

export function StudioCarousel() {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={staggerContainer(0.1, 0.1)}
      className="relative w-full px-6 lg:px-12 py-16 lg:py-24"
    >
      <motion.div variants={fadeUp} className="max-w-3xl mb-12">
        <p className="tnb-eyebrow mb-4">For Every Stage of Your Brand</p>
        <h2 className="tnb-headline text-4xl lg:text-6xl">
          Three studios. One bundled GPU. Zero lag.
        </h2>
        <p className="text-base text-muted-foreground mt-5 max-w-2xl">
          Every studio runs on the same FLUX.1-dev endpoint with our clothing
          LoRA, ControlNet, SAM2, and Real-ESRGAN baked in. Switch between
          try-on, design, and stylist without ever leaving the canvas.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {STUDIOS.map((studio) => {
          const Icon = studio.icon;
          return (
            <motion.div
              key={studio.index}
              variants={studioCard}
              initial="rest"
              whileHover="hover"
            >
              <Link
                href={studio.href}
                className="group relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-border/50 bg-background p-7 h-full transition-colors hover:border-foreground/40"
              >
                <div className="flex items-start justify-between">
                  <span className="tnb-eyebrow">STUDIO {studio.index}</span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>

                <div
                  className={`relative aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-br ${studio.accent}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={studio.preview}
                    alt={studio.title}
                    className="size-full object-cover mix-blend-luminosity opacity-90 transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  <span className="absolute top-3 left-4 tnb-numeral text-white text-[3rem] leading-none">
                    {studio.index}
                  </span>
                  <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white/90 text-sm">
                    <Icon className="size-4" />
                    {studio.title}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="tnb-headline text-2xl lg:text-3xl">
                    {studio.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{studio.blurb}</p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
