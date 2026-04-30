"use client";

import { motion } from "framer-motion";
import {
  CreditCard,
  FolderHeart,
  Palette,
  Shirt,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/Logo";
import { railItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

type StudioEntry = {
  href: string;
  label: string;
  index: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
};

const STUDIOS: StudioEntry[] = [
  {
    href: "/studios/tryon",
    label: "Try-On",
    index: "01",
    icon: Shirt,
    description: "Wear it before you buy it.",
  },
  {
    href: "/studios/design",
    label: "Design",
    index: "02",
    icon: Wand2,
    description: "Sketch into a finished garment.",
  },
  {
    href: "/studios/stylist",
    label: "Stylist",
    index: "03",
    icon: Sparkles,
    description: "Generate full looks instantly.",
  },
];

const SECONDARY: StudioEntry[] = [
  {
    href: "/account/brand-dna",
    label: "Brand DNA",
    index: "04",
    icon: Palette,
    description: "Train your aesthetic.",
  },
  {
    href: "/account/closet",
    label: "Closet",
    index: "05",
    icon: FolderHeart,
    description: "Saved garments + drafts.",
  },
  {
    href: "/account/billing",
    label: "Plan",
    index: "06",
    icon: CreditCard,
    description: "Credits & subscription.",
  },
];

export function StudioRail() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="hidden lg:flex flex-col gap-10 px-6 py-8 w-[260px] border-r border-border/40 bg-background/60 backdrop-blur-xl sticky top-0 h-dvh">
      <Link href="/" className="inline-flex items-center">
        <Logo size={32} withWordmark wordmarkClassName="text-xl" />
      </Link>

      <nav className="flex flex-col gap-1.5" aria-label="Studios">
        <p className="tnb-eyebrow mb-1">Studios</p>
        {STUDIOS.map((entry) => (
          <RailLink key={entry.href} entry={entry} active={isActive(entry.href)} />
        ))}
      </nav>

      <nav className="flex flex-col gap-1.5" aria-label="Workspace">
        <p className="tnb-eyebrow mb-1">Workspace</p>
        {SECONDARY.map((entry) => (
          <RailLink key={entry.href} entry={entry} active={isActive(entry.href)} />
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-border/40 p-4 bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Running on the bundled FLUX endpoint. Generations average 12-18s.
        </p>
      </div>
    </aside>
  );
}

function RailLink({ entry, active }: { entry: StudioEntry; active: boolean }) {
  const Icon = entry.icon;
  return (
    <motion.div initial="rest" whileHover="hover" variants={railItem}>
      <Link
        href={entry.href}
        className={cn(
          "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
          active ? "tnb-rail-active" : "hover:bg-muted/60 text-foreground/80"
        )}
      >
        <span className="text-[11px] font-mono pt-1 opacity-60">{entry.index}</span>
        <Icon className="size-4 mt-0.5 shrink-0" />
        <div className="flex flex-col">
          <span className="text-sm font-medium leading-tight">{entry.label}</span>
          <span className="text-[11px] opacity-60 leading-snug">
            {entry.description}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
