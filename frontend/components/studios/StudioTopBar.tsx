"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const TITLE_BY_PATH: Record<string, string> = {
  "/studios/tryon": "Try-On Studio",
  "/studios/design": "Design Studio",
  "/studios/stylist": "Stylist Studio",
  "/account/closet": "Closet",
  "/account/brand-dna": "Brand DNA",
  "/account/billing": "Plan & Billing",
};

export function StudioTopBar() {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);

  const title = pathname
    ? Object.entries(TITLE_BY_PATH).find(([prefix]) =>
        pathname.startsWith(prefix)
      )?.[1]
    : null;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-4 px-6 lg:px-10 py-4 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Link href="/" className="lg:hidden inline-flex items-center">
          <Logo size={26} withWordmark wordmarkClassName="text-base" />
        </Link>
        <span className="hidden lg:inline text-sm uppercase tracking-[0.18em] text-muted-foreground">
          {title || "Studios"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {user ? (
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href="/account/billing">{user.email?.split("@")[0] || "Account"}</Link>
          </Button>
        ) : (
          <Button asChild size="sm" className="rounded-full">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
