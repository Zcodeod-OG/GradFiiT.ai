"use client";

import {
  Backpack,
  Layers,
  Shirt,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/utils";

export type GarmentTypeKey =
  | "all"
  | "recent"
  | "upper_body"
  | "lower_body"
  | "full_body"
  | "outerwear"
  | "accessory";

type CategorySidebarProps = {
  selected: GarmentTypeKey;
  onSelect: (next: GarmentTypeKey) => void;
  counts: Record<GarmentTypeKey, number>;
};

type Entry = {
  key: GarmentTypeKey;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

// Order matters — top of the sidebar feels more "primary". "Recent" is
// the dedicated entry for items added in the last 7 days; counts are
// computed by the parent so we don't have to re-derive here.
const ENTRIES: Entry[] = [
  { key: "all", label: "All", icon: WandSparkles },
  { key: "recent", label: "Recently added", icon: Sparkles },
  { key: "upper_body", label: "Tops", icon: Shirt },
  { key: "lower_body", label: "Bottoms", icon: Shirt },
  { key: "full_body", label: "Full body", icon: Layers },
  { key: "outerwear", label: "Outerwear", icon: Layers },
  { key: "accessory", label: "Accessories", icon: Backpack },
];

export function CategorySidebar({
  selected,
  onSelect,
  counts,
}: CategorySidebarProps) {
  return (
    <>
      {/* Mobile: horizontal scroll chips */}
      <nav
        aria-label="Closet categories"
        className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-2 lg:hidden"
      >
        {ENTRIES.map((entry) => (
          <Chip
            key={entry.key}
            entry={entry}
            active={selected === entry.key}
            count={counts[entry.key] ?? 0}
            onClick={() => onSelect(entry.key)}
          />
        ))}
      </nav>

      {/* Desktop: vertical sidebar */}
      <aside
        aria-label="Closet categories"
        className="hidden w-52 shrink-0 flex-col gap-1 lg:flex"
      >
        {ENTRIES.map((entry) => (
          <SidebarRow
            key={entry.key}
            entry={entry}
            active={selected === entry.key}
            count={counts[entry.key] ?? 0}
            onClick={() => onSelect(entry.key)}
          />
        ))}
      </aside>
    </>
  );
}

function SidebarRow({
  entry,
  active,
  count,
  onClick,
}: {
  entry: Entry;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "bg-foreground/[0.06] text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon
          className={cn(
            "size-4 transition-colors",
            active ? "text-foreground" : "text-muted-foreground/80"
          )}
        />
        <span className="font-medium">{entry.label}</span>
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-mono",
          active ? "bg-foreground text-background" : "bg-muted/70"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function Chip({
  entry,
  active,
  count,
  onClick,
}: {
  entry: Entry;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border/50 bg-background/60 text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {entry.label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-mono",
          active ? "bg-background/20" : "bg-muted/60"
        )}
      >
        {count}
      </span>
    </button>
  );
}
