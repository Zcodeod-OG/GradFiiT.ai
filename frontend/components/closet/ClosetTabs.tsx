"use client";

import { Layers, Shirt, WandSparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export type ClosetTab = "garments" | "outfits" | "looks";

type ClosetTabsProps = {
  value: ClosetTab;
  onChange: (next: ClosetTab) => void;
  garmentCount: number;
  lookCount: number;
};

export function ClosetTabs({
  value,
  onChange,
  garmentCount,
  lookCount,
}: ClosetTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/60 p-1 backdrop-blur-md">
      <TabButton
        active={value === "garments"}
        onClick={() => onChange("garments")}
        icon={<Shirt className="size-3.5" />}
        label="Wardrobe"
        count={garmentCount}
      />
      <TabButton
        active={value === "outfits"}
        onClick={() => onChange("outfits")}
        icon={<WandSparkles className="size-3.5" />}
        label="Outfits"
      />
      <TabButton
        active={value === "looks"}
        onClick={() => onChange("looks")}
        icon={<Layers className="size-3.5" />}
        label="Looks"
        count={lookCount}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
      {count !== undefined ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-mono",
            active ? "bg-background/20" : "bg-muted/60"
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
