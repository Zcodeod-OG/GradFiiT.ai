"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoProps = {
  /** Pixel size of the icon mark (square). */
  size?: number;
  /** Whether to render the "GradFiT" wordmark next to the icon. */
  withWordmark?: boolean;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Optional className applied to the wordmark span. */
  wordmarkClassName?: string;
  priority?: boolean;
};

/**
 * Canonical GradFiT brand mark. Wraps `next/image` so the logo is
 * served via the Next image optimization pipeline and consistently
 * sized everywhere it appears (Navbar, Footer, StudioRail, StudioTopBar,
 * email templates, etc.). Pass `withWordmark` to also render the
 * "GradFiT" type next to the icon.
 *
 * The PNG asset lives at `/brand/gradfit-icon-v2.png`. It is the cropped,
 * production-ready icon — the original mockup is kept alongside it as
 * `/brand/gradfit-mockup.png` for reference. The `-v2` suffix is a deliberate
 * cache-buster: bump it whenever the icon is recropped so `next/image`'s
 * optimizer cache and browsers fetch the new variant.
 */
export function Logo({
  size = 32,
  withWordmark = false,
  className,
  wordmarkClassName,
  priority = false,
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/brand/gradfit-icon-v2.png"
        alt="GradFiT"
        width={size}
        height={size}
        priority={priority}
        className="rounded-[22%] shadow-[0_8px_18px_-10px_rgba(15,23,42,0.45)]"
      />
      {withWordmark ? (
        <span
          className={cn(
            "font-display font-bold tracking-tight text-foreground",
            wordmarkClassName
          )}
        >
          GradFiT
        </span>
      ) : null}
    </span>
  );
}
