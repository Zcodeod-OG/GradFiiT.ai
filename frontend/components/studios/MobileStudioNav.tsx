"use client";

import {
  FolderHeart,
  Shirt,
  Sparkles,
  User,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type TabEntry = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string) => boolean;
};

const TABS: TabEntry[] = [
  {
    href: "/try",
    label: "Try-On",
    icon: Shirt,
    match: (p) => p === "/try" || p.startsWith("/studios/tryon"),
  },
  {
    href: "/studios/design",
    label: "Design",
    icon: Wand2,
    match: (p) => p.startsWith("/studios/design"),
  },
  {
    href: "/studios/stylist",
    label: "Stylist",
    icon: Sparkles,
    match: (p) => p.startsWith("/studios/stylist"),
  },
  {
    href: "/account/closet",
    label: "Closet",
    icon: FolderHeart,
    match: (p) => p.startsWith("/account/closet"),
  },
  {
    href: "/account/billing",
    label: "Account",
    icon: User,
    match: (p) =>
      p.startsWith("/account/billing") ||
      p.startsWith("/account/brand-dna") ||
      p.startsWith("/login"),
  },
];

export function MobileStudioNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-xl lg:hidden safe-area-bottom"
      aria-label="Mobile navigation"
    >
      <ul className="flex items-stretch justify-around px-1 pt-1">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1 min-w-0">
              <Link
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] rounded-lg transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.5px]")} />
                <span className="text-[10px] font-medium leading-none truncate max-w-full px-0.5">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
